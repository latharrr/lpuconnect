import { Server } from 'socket.io';
import { config } from '../config.js';
import { run } from '../db.js';
import { validateSession } from '../sessions.js';
import { getUser, banState, friendEmails, friendView, emailByPublicId, areFriends, isBlockedEither, addFriendship, touchFriendChat, invalidateUser } from '../users.js';
import { track } from '../events.js';
import { captureError } from '../errors.js';
import { socketLimiter, flagMessage, SOCKET_LIMITS } from '../guard.js';
import { fileReport, blockPair, REPORT_REASONS } from '../moderation.js';
import { notify } from '../push.js';
import { clampText } from '../util.js';
import { MatchQueue } from './matching.js';
import { Rooms } from './rooms.js';

SOCKET_LIMITS.rtc_signal = [80, 40];
SOCKET_LIMITS.join_direct = [5, 10 / 60];

let io = null;
let queue = null;
let rooms = null;
const timers = [];
const online = new Map(); // email -> Set(socketId)

export function setupRealtime(server) {
    io = new Server(server, {
        cors: { origin: config.allowedOrigins, credentials: true },
        maxHttpBufferSize: 16 * 1024,
        pingInterval: 20_000,
        pingTimeout: 20_000,
    });
    rooms = new Rooms({ io, graceMs: config.match.reconnectGraceMs, onClose: onRoomClose });
    queue = new MatchQueue({
        canPair: (a, b) => !isBlockedEither(a.email, b.email) && !banState(getUser(a.email)) && !banState(getUser(b.email)),
        onMatch,
        onTimeout: (e) => {
            io.to(e.socketId).emit('search_timeout');
            track('search_timeout', { email: e.email, props: { wait_ms: Date.now() - e.since } });
        },
        prefFallbackMs: config.match.prefFallbackMs,
        searchTimeoutMs: config.match.searchTimeoutMs,
        recentPairMs: config.match.recentPairMs,
    });
    io.use(authenticate);
    io.on('connection', onConnection);
    timers.push(setInterval(() => queue.sweep(), 2000).unref());
    timers.push(setInterval(broadcastQueueStatus, 5000).unref());
    return io;
}

// Unauthenticated or banned sockets never connect.
function authenticate(socket, next) {
    const email = validateSession(socket.handshake.auth?.token);
    if (!email) return next(new Error('unauthorized'));
    const user = getUser(email);
    if (!user) return next(new Error('unauthorized'));
    if (banState(user)) return next(new Error('banned'));
    socket.data = {
        email,
        publicId: user.public_id,
        limiter: socketLimiter(),
        sessionId: String(socket.handshake.auth?.sessionId || '').slice(0, 40) || null,
        lastRoom: null,
    };
    next();
}

function emitToUser(email, event, payload) {
    for (const sid of online.get(email) || []) io.to(sid).emit(event, payload);
}

function onlineFriendIds(email) {
    return friendEmails(email).filter(f => online.has(f)).map(f => getUser(f)?.public_id).filter(Boolean);
}

function presenceAdd(socket) {
    const { email, publicId } = socket.data;
    let set = online.get(email);
    const wasOffline = !set || set.size === 0;
    if (!set) online.set(email, (set = new Set()));
    set.add(socket.id);
    if (wasOffline) {
        for (const f of friendEmails(email)) {
            if (online.has(f)) emitToUser(f, 'presence', { id: publicId, online: true });
        }
    }
    socket.emit('hello', { serverNow: Date.now(), onlineFriends: onlineFriendIds(email), online: online.size });
}

function presenceRemove(socket) {
    const { email, publicId } = socket.data;
    const set = online.get(email);
    if (!set) return;
    set.delete(socket.id);
    if (set.size) return;
    online.delete(email);
    for (const f of friendEmails(email)) if (online.has(f)) emitToUser(f, 'presence', { id: publicId, online: false });
}

function onConnection(socket) {
    const email = socket.data.email;
    presenceAdd(socket);
    run('UPDATE users SET last_seen = ? WHERE email = ?', new Date().toISOString(), email);

    const on = (event, fn) => socket.on(event, (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!socket.data.limiter.allow(event)) {
            if (socket.data.limiter.strikes > 60) socket.disconnect(true);
            return reply({ error: 'rate_limited' });
        }
        try {
            const out = fn(data && typeof data === 'object' ? data : {});
            if (out && typeof out.then === 'function') {
                out.then(v => reply(v ?? { ok: true }), (err) => fail(event, err, reply));
            } else {
                reply(out ?? { ok: true });
            }
        } catch (err) {
            fail(event, err, reply);
        }
    });

    function fail(event, err, reply) {
        captureError(err, { where: `socket:${event}` });
        track('socket_error', { email, props: { event } });
        reply({ error: 'server_error' });
    }

    const access = (d) => rooms.access(d.room, socket);

    on('start_chat', (d) => {
        if (banState(getUser(email))) return { error: 'banned' };
        for (const r of rooms.roomsOf(socket.id)) rooms.close(r, 'skip', email);
        const interests = new Set((Array.isArray(d.interests) ? d.interests : []).map(String).slice(0, 5));
        const matched = queue.add({ email, socketId: socket.id, socket, interests, since: Date.now(), isConnected: () => socket.connected });
        track('search_start', { email, sessionId: socket.data.sessionId, props: { interests: interests.size } });
        return { ok: true, matched, waiting: queue.size, online: online.size };
    });

    on('cancel_match', () => {
        const e = queue.remove(socket.id);
        if (e) track('search_cancel', { email, props: { wait_ms: Date.now() - e.since } });
        return { ok: true };
    });

    on('join_direct', (d) => {
        const friendEmail = typeof d.friendId === 'string' ? emailByPublicId(d.friendId) : null;
        if (!friendEmail || !areFriends(email, friendEmail) || isBlockedEither(email, friendEmail)) return { error: 'not_friends' };
        queue.remove(socket.id);
        const room = rooms.joinDirect(email, socket, friendEmail);
        track('direct_open', { email });
        const partner = room.members.get(friendEmail);
        if (partner?.connected) {
            const meUser = getUser(email);
            const friendUser = getUser(friendEmail);
            rooms.send(room.members.get(email), 'direct_matched', { room: room.id, partner: friendView(friendUser), serverNow: Date.now() });
            rooms.send(partner, 'direct_matched', { room: room.id, partner: friendView(meUser), serverNow: Date.now() });
            return { ok: true, matched: true };
        }
        const me = friendView(getUser(email));
        emitToUser(friendEmail, 'direct_invite', { from: me });
        notify(friendEmail, {
            kind: 'direct', subject: me.id, capMs: 30 * 60_000,
            title: `${me.name} wants to chat`, body: 'Open UniConnect to join them.', url: `/?direct=${me.id}`,
        }).catch(() => {});
        return { ok: true, waiting: true, room: room.id };
    });

    on('send_message', (d) => {
        const acc = access(d);
        if (!acc) return { error: 'not_in_room' };
        const text = clampText(d.text, 2000);
        if (!text) return { error: 'empty' };
        const flags = flagMessage(text);
        if (flags.length) {
            acc.room.flagged++;
            track('auto_flag', { email, props: { cats: flags.join(',') } });
        }
        acc.me.msgs++;
        const ts = Date.now();
        rooms.send(acc.partner, 'receive_message', { room: acc.room.id, text, ts });
        if (acc.room.type === 'direct' && (!acc.room.touchedAt || ts - acc.room.touchedAt > 60_000)) {
            acc.room.touchedAt = ts;
            touchFriendChat(email, acc.partner.email);
        }
        return { ok: true, ts };
    });

    on('skip', (d) => {
        const acc = access(d);
        if (!acc) return { error: 'not_in_room' };
        rooms.close(acc.room, acc.room.type === 'direct' ? 'left' : 'skip', email);
        return { ok: true };
    });

    on('enjoy', (d) => {
        const acc = access(d);
        if (!acc || acc.room.type !== 'match' || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (room.enjoy.has(email)) return { ok: true };
        room.enjoy.add(email);
        if (room.enjoy.has(partner.email)) {
            for (const m of room.members.values()) {
                rooms.send(m, 'enjoy_mutual', { room: room.id });
                track('enjoy_accept', { email: m.email });
            }
            return { ok: true, mutual: true };
        }
        rooms.send(partner, 'enjoy_request', { room: room.id });
        track('enjoy_request', { email });
        return { ok: true, mutual: false };
    });

    on('friend_request', (d) => {
        const acc = access(d);
        if (!acc || acc.room.type !== 'match' || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (room.revealed) return { ok: true };
        if (!(room.enjoy.has(email) && room.enjoy.has(partner.email))) return { error: 'enjoy_first' };
        room.friendReq.add(email);
        track('friend_request', { email });
        if (room.friendReq.has(partner.email)) { reveal(room); return { ok: true, revealed: true }; }
        rooms.send(partner, 'friend_request', { room: room.id });
        return { ok: true };
    });

    on('friend_respond', (d) => {
        const acc = access(d);
        if (!acc || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (!room.friendReq.has(partner.email)) return { error: 'no_request' };
        if (d.accept === true) { room.friendReq.add(email); reveal(room); return { ok: true, revealed: true }; }
        room.friendReq.delete(partner.email);
        rooms.send(partner, 'friend_reject', { room: room.id });
        return { ok: true };
    });

    on('extend_request', (d) => {
        const acc = access(d);
        if (!acc || acc.room.type !== 'match' || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        room.extendReq.add(email);
        track('extend_request', { email });
        if (room.extendReq.has(partner.email)) { extendRoom(room); return { ok: true, extended: true }; }
        rooms.send(partner, 'extend_request', { room: room.id });
        return { ok: true };
    });

    on('extend_respond', (d) => {
        const acc = access(d);
        if (!acc || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (!room.extendReq.has(partner.email)) return { error: 'no_request' };
        if (d.accept === true) { extendRoom(room); track('extend_accept', { email }); return { ok: true }; }
        room.extendReq.delete(partner.email);
        rooms.send(partner, 'extend_reject', { room: room.id });
        return { ok: true };
    });

    on('video_request', (d) => {
        const acc = access(d);
        if (!acc || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (!room.revealed && Date.now() < room.videoUnlockAt) return { error: 'video_locked', unlockAt: room.videoUnlockAt };
        if (room.videoStartedAt) return { error: 'video_active' };
        room.videoReq = email;
        rooms.send(partner, 'video_request', { room: room.id });
        track('video_request', { email });
        return { ok: true };
    });

    on('video_respond', (d) => {
        const acc = access(d);
        if (!acc || !acc.partner) return { error: 'not_in_room' };
        const { room, partner } = acc;
        if (room.videoReq !== partner.email) return { error: 'no_request' };
        room.videoReq = null;
        if (d.accept !== true) { rooms.send(partner, 'video_reject', { room: room.id }); return { ok: true }; }
        room.videoStartedAt = Date.now();
        rooms.send(partner, 'video_start', { room: room.id, initiator: true });
        rooms.send(acc.me, 'video_start', { room: room.id, initiator: false });
        track('video_accept', { email });
        return { ok: true };
    });

    on('video_end', (d) => {
        const acc = access(d);
        if (!acc) return { error: 'not_in_room' };
        endVideo(acc.room, email);
        return { ok: true };
    });

    // WebRTC offer/answer/ICE relayed only inside an authorised room with an active call.
    on('rtc_signal', (d) => {
        const acc = access(d);
        if (!acc || !acc.partner || !acc.room.videoStartedAt) return { error: 'not_in_call' };
        if (!d.data || typeof d.data !== 'object') return { error: 'bad_signal' };
        rooms.send(acc.partner, 'rtc_signal', { room: acc.room.id, data: d.data });
        return { ok: true };
    });

    on('report', (d) => {
        const target = reportTarget(d);
        if (!target) return { error: 'nothing_to_report' };
        if (!REPORT_REASONS.includes(d.reason)) return { error: 'bad_reason' };
        const result = fileReport({ reporter: email, reported: target.email, reason: d.reason, note: d.note, context: target.context });
        if (target.room) rooms.close(target.room, 'report', email);
        socket.data.lastRoom = null;
        if (result.banned) kickUser(target.email, 'suspended');
        return { ok: true };
    });

    on('block', (d) => {
        const target = reportTarget(d);
        if (!target) return { error: 'nothing_to_block' };
        blockPair(email, target.email);
        if (target.room) rooms.close(target.room, 'block', email);
        socket.data.lastRoom = null;
        emitToUser(target.email, 'friends_changed', {});
        return { ok: true };
    });

    on('rejoin', (d) => {
        const room = rooms.rejoin(d.room, socket);
        if (!room) return { error: 'gone' };
        if (room.videoStartedAt) endVideo(room, null);
        track('reconnect', { email });
        return { ok: true, endsAt: room.endsAt, serverNow: Date.now() };
    });

    // The room just closed, or is still open: who and what are we reporting?
    function reportTarget(d) {
        const acc = access(d);
        if (acc?.partner) return { email: acc.partner.email, room: acc.room, context: contextOf(acc.room, acc.partner) };
        const last = socket.data.lastRoom;
        if (last && last.roomId === d.room && Date.now() - last.at < 5 * 60_000) return { email: last.partnerEmail, room: null, context: last.context };
        return null;
    }

    socket.on('disconnect', () => {
        queue.remove(socket.id);
        rooms.dropSocket(socket);
        presenceRemove(socket);
    });
}

function contextOf(room, partner) {
    return {
        type: room.type,
        seconds: Math.round((Date.now() - room.createdAt) / 1000),
        video: !!room.videoStartedAt,
        partnerMsgs: partner.msgs,
        flagged: room.flagged,
        revealed: room.revealed,
    };
}

function onMatch(a, b, t) {
    if (!a.socket.connected || !b.socket.connected) {
        if (a.socket.connected) queue.add({ ...a });
        if (b.socket.connected) queue.add({ ...b });
        return;
    }
    const room = rooms.createMatch(a, b);
    const [ma, mb] = [room.members.get(a.email), room.members.get(b.email)];
    const base = { room: room.id, endsAt: room.endsAt, videoUnlockAt: room.videoUnlockAt, serverNow: Date.now() };
    rooms.send(ma, 'matched', { ...base, me: ma.alias, partner: { alias: mb.alias } });
    rooms.send(mb, 'matched', { ...base, me: mb.alias, partner: { alias: ma.alias } });
    track('match_made', { email: a.email, props: { wait_ms: t - a.since } });
    track('match_made', { email: b.email, props: { wait_ms: t - b.since } });
}

function reveal(room) {
    const [x, y] = [...room.members.keys()];
    addFriendship(x, y);
    room.revealed = true;
    invalidateUser(x);
    invalidateUser(y);
    for (const m of room.members.values()) {
        const other = m.email === x ? y : x;
        rooms.send(m, 'revealed', { room: room.id, partner: friendView(getUser(other)) });
        emitToUser(m.email, 'friends_changed', {});
        if (online.has(other)) emitToUser(m.email, 'presence', { id: getUser(other).public_id, online: true });
        track('friend_accept', { email: m.email });
    }
}

function extendRoom(room) {
    const endsAt = rooms.extend(room);
    for (const m of room.members.values()) rooms.send(m, 'extend_accept', { room: room.id, endsAt, serverNow: Date.now() });
}

function endVideo(room, byEmail) {
    if (!room.videoStartedAt) return;
    const secs = Math.round((Date.now() - room.videoStartedAt) / 1000);
    room.videoStartedAt = null;
    for (const m of room.members.values()) {
        if (m.email !== byEmail) rooms.send(m, 'video_end', { room: room.id });
        track('video_end', { email: m.email, props: { duration_s: secs } });
    }
}

function onRoomClose(room, reason, actorEmail) {
    const seconds = Math.round((Date.now() - room.createdAt) / 1000);
    const members = [...room.members.values()];
    if (room.videoStartedAt) {
        const secs = Math.round((Date.now() - room.videoStartedAt) / 1000);
        for (const m of members) track('video_end', { email: m.email, props: { duration_s: secs } });
    }
    for (const m of members) {
        const partner = members.find(p => p !== m);
        track('chat_end', { email: m.email, props: { reason, seconds, type: room.type } });
        track(room.type === 'match' ? 'msg_sent' : 'direct_msg_count', { email: m.email, props: { count: m.msgs } });
        if (reason === 'skip' && m.email === actorEmail) track('skip', { email: m.email, props: { seconds_in_chat: seconds } });
        const s = io.sockets.sockets.get(m.socketId);
        if (s && partner && room.type === 'match') {
            s.data.lastRoom = { roomId: room.id, partnerEmail: partner.email, context: contextOf(room, partner), at: Date.now() };
        }
    }
}

function broadcastQueueStatus() {
    if (!queue.size) return;
    const payload = { waiting: queue.size, online: online.size };
    for (const e of queue.waiting.values()) io.to(e.socketId).emit('queue_status', payload);
}

export function kickUser(email, reason) {
    if (!io) return;
    queue?.removeEmail(email);
    for (const sid of [...(online.get(email) || [])]) {
        const s = io.sockets.sockets.get(sid);
        s?.emit('kicked', { reason });
        s?.disconnect(true);
    }
}

export function notifyFriendsChanged(email) {
    if (io) emitToUser(email, 'friends_changed', {});
}

export function liveStats() {
    return {
        sockets: io ? io.engine.clientsCount : 0,
        onlineUsers: online.size,
        queue: queue ? queue.size : 0,
        ...(rooms ? rooms.stats() : { rooms: 0 }),
    };
}

export async function shutdownRealtime() {
    timers.splice(0).forEach(clearInterval);
    if (!io) return;
    io.emit('server_restart', {});
    await new Promise(r => io.close(() => r()));
    io = null;
    online.clear();
}

// Test hook: inspect internals without exporting mutable state widely.
export const _internals = () => ({ queue, rooms, online });
