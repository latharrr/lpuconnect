// Chat rooms. The server holds all consent state (enjoy, friend, extend, video), so a
// client can neither act in a room it is not in nor complete a two-sided step alone.
import { randomId, randomAlias } from '../util.js';

const CHAT_MS = 10 * 60_000;
const VIDEO_UNLOCK_MS = 30_000;

export class Rooms {
    constructor({ io, graceMs, onClose }) {
        this.io = io;
        this.graceMs = graceMs;
        this.onClose = onClose;
        this.rooms = new Map();     // roomId -> room
        this.bySocket = new Map();  // socketId -> Set(roomId)
        this.direct = new Map();    // pairKey -> roomId
    }

    get size() { return this.rooms.size; }

    index(socketId, roomId) {
        let s = this.bySocket.get(socketId);
        if (!s) this.bySocket.set(socketId, (s = new Set()));
        s.add(roomId);
    }

    unindex(socketId, roomId) {
        const s = this.bySocket.get(socketId);
        if (!s) return;
        s.delete(roomId);
        if (!s.size) this.bySocket.delete(socketId);
    }

    roomsOf(socketId) {
        return [...(this.bySocket.get(socketId) || [])].map(id => this.rooms.get(id)).filter(Boolean);
    }

    member(email, socket) {
        return { email, socketId: socket.id, alias: randomAlias(), connected: true, grace: null, msgs: 0, joinedAt: Date.now() };
    }

    attach(room, m) {
        const s = this.io.sockets.sockets.get(m.socketId);
        s?.join(room.id);
        this.index(m.socketId, room.id);
    }

    createMatch(a, b) {
        const t = Date.now();
        const room = {
            id: `m_${randomId(12)}`, type: 'match', createdAt: t, endsAt: t + CHAT_MS, videoUnlockAt: t + VIDEO_UNLOCK_MS,
            members: new Map(), enjoy: new Set(), friendReq: new Set(), extendReq: new Set(),
            videoReq: null, videoStartedAt: null, revealed: false, flagged: 0, timer: null,
        };
        for (const p of [a, b]) {
            const m = this.member(p.email, p.socket);
            room.members.set(p.email, m);
        }
        this.rooms.set(room.id, room);
        for (const m of room.members.values()) this.attach(room, m);
        this.armTimer(room);
        return room;
    }

    // Deterministic per friend pair while open; the id itself is random and unguessable.
    joinDirect(email, socket, friendEmail) {
        const key = email < friendEmail ? `${email}|${friendEmail}` : `${friendEmail}|${email}`;
        let room = this.rooms.get(this.direct.get(key));
        if (!room) {
            room = {
                id: `d_${randomId(12)}`, type: 'direct', createdAt: Date.now(), endsAt: null, videoUnlockAt: 0,
                members: new Map(), enjoy: new Set(), friendReq: new Set(), extendReq: new Set(),
                videoReq: null, videoStartedAt: null, revealed: true, flagged: 0, timer: null, pairKey: key, expected: [email, friendEmail],
            };
            this.rooms.set(room.id, room);
            this.direct.set(key, room.id);
        }
        const existing = room.members.get(email);
        if (existing) this.unindex(existing.socketId, room.id);
        const m = this.member(email, socket);
        room.members.set(email, m);
        this.attach(room, m);
        return room;
    }

    armTimer(room) {
        if (room.timer) clearTimeout(room.timer);
        if (!room.endsAt) return;
        room.timer = setTimeout(() => this.close(room, 'timeout', null), Math.max(0, room.endsAt - Date.now()));
        room.timer.unref?.();
    }

    // Authorisation: the socket must be the current, connected member of this room.
    access(roomId, socket) {
        if (typeof roomId !== 'string') return null;
        const room = this.rooms.get(roomId);
        const email = socket.data.email;
        const me = room?.members.get(email);
        if (!room || !me || me.socketId !== socket.id || !me.connected) return null;
        const partner = [...room.members.values()].find(m => m.email !== email) || null;
        return { room, me, partner };
    }

    send(m, event, payload = {}) {
        if (m?.connected) this.io.to(m.socketId).emit(event, payload);
    }

    close(room, reason, actorEmail) {
        if (!this.rooms.has(room.id)) return;
        this.rooms.delete(room.id);
        if (room.pairKey) this.direct.delete(room.pairKey);
        if (room.timer) clearTimeout(room.timer);
        for (const m of room.members.values()) {
            if (m.grace) clearTimeout(m.grace);
            this.io.sockets.sockets.get(m.socketId)?.leave(room.id);
            this.unindex(m.socketId, room.id);
            if (m.email !== actorEmail) this.send(m, 'partner_left', { room: room.id, reason });
        }
        this.onClose?.(room, reason, actorEmail);
    }

    // Disconnect: keep the seat for graceMs so a network blip does not end the chat.
    dropSocket(socket) {
        for (const room of this.roomsOf(socket.id)) {
            const me = room.members.get(socket.data.email);
            this.unindex(socket.id, room.id);
            if (!me || me.socketId !== socket.id) continue;
            if (room.type === 'direct' && room.members.size === 1) { this.close(room, 'left', me.email); continue; }
            me.connected = false;
            for (const m of room.members.values()) if (m !== me) this.send(m, 'partner_reconnecting', { room: room.id, graceSec: Math.round(this.graceMs / 1000) });
            me.grace = setTimeout(() => this.close(room, 'disconnect', me.email), this.graceMs);
            me.grace.unref?.();
        }
    }

    rejoin(roomId, socket) {
        const room = this.rooms.get(roomId);
        const me = room?.members.get(socket.data.email);
        if (!room || !me) return null;
        if (me.grace) clearTimeout(me.grace);
        me.grace = null;
        if (me.socketId !== socket.id) this.unindex(me.socketId, room.id);
        me.socketId = socket.id;
        me.connected = true;
        this.attach(room, me);
        for (const m of room.members.values()) if (m !== me) this.send(m, 'partner_back', { room: room.id });
        return room;
    }

    extend(room) {
        room.endsAt = Date.now() + CHAT_MS;
        room.extendReq.clear();
        this.armTimer(room);
        return room.endsAt;
    }

    stats() {
        let match = 0; let direct = 0;
        for (const r of this.rooms.values()) r.type === 'match' ? match++ : direct++;
        return { rooms: this.rooms.size, matchRooms: match, directRooms: direct };
    }
}
