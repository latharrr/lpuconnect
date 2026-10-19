import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, emit, waitFor, never, sleep, matchedPair } from './helpers.js';
import { _internals } from '../src/realtime/index.js';
import { get, all } from '../src/db.js';

let h;
before(async () => { h = await boot(); });
after(async () => { await h.close(); });

test('B3: sockets without a valid token are refused', async () => {
    const err = await h.connect(undefined, { expectError: true });
    assert.equal(err.message, 'unauthorized');
    const bad = await h.connect('not-a-real-token', { expectError: true });
    assert.equal(bad.message, 'unauthorized');
});

test('B4: the matched payload carries no email or real name', async () => {
    const p = await matchedPair(h);
    const raw = JSON.stringify([p.ma, p.mb]);
    assert.ok(!raw.includes('@'), 'no email');
    assert.ok(!raw.includes(p.a.user.name) && !raw.includes(p.b.user.name), 'no real name');
    assert.ok(p.ma.partner.alias && p.ma.partner.alias !== p.mb.partner.alias);
    await emit(p.sa, 'skip', { room: p.room });
});

test('B5/B14: only room members can send; text arrives exactly as typed', async () => {
    const p = await matchedPair(h);
    const intruder = await h.connect((await h.guest()).token);
    const denied = await emit(intruder, 'send_message', { room: p.room, text: 'injected', from: 'partner' });
    assert.equal(denied.error, 'not_in_room');
    const neverInjected = never(p.sb, 'receive_message', 300);
    await neverInjected;
    const got = waitFor(p.sb, 'receive_message');
    await emit(p.sa, 'send_message', { room: p.room, text: "I'm <3 you & me" });
    const msg = await got;
    assert.equal(msg.text, "I'm <3 you & me");
    assert.equal(msg.from, undefined, 'sender is never client-supplied');
    for (const ev of ['skip', 'enjoy', 'friend_request', 'friend_respond', 'video_request', 'extend_request', 'rtc_signal']) {
        const r = await emit(intruder, ev, { room: p.room, accept: true, data: {} });
        assert.ok(r.error, `${ev} should be refused for non-members`);
    }
    await emit(p.sa, 'skip', { room: p.room });
});

test('B6: friendship needs mutual enjoy, a request, and an accept from the other side', async () => {
    const p = await matchedPair(h);
    assert.equal((await emit(p.sa, 'friend_respond', { room: p.room, accept: true })).error, 'no_request');
    assert.equal((await emit(p.sa, 'friend_request', { room: p.room })).error, 'enjoy_first');
    const enjoyReq = waitFor(p.sb, 'enjoy_request');
    await emit(p.sa, 'enjoy', { room: p.room });
    await enjoyReq;
    const mutualA = waitFor(p.sa, 'enjoy_mutual');
    await emit(p.sb, 'enjoy', { room: p.room });
    await mutualA;
    // A cannot accept their own request.
    const req = waitFor(p.sb, 'friend_request');
    await emit(p.sa, 'friend_request', { room: p.room });
    await req;
    assert.equal((await emit(p.sa, 'friend_respond', { room: p.room, accept: true })).error, 'no_request');
    const n0 = get('SELECT COUNT(*) AS n FROM friends').n;
    const revA = waitFor(p.sa, 'revealed');
    const revB = waitFor(p.sb, 'revealed');
    await emit(p.sb, 'friend_respond', { room: p.room, accept: true });
    const [ra, rb] = await Promise.all([revA, revB]);
    assert.equal(ra.partner.name, p.b.user.name);
    assert.equal(rb.partner.name, p.a.user.name);
    assert.ok(!JSON.stringify([ra, rb]).includes('@'), 'reveal sends profile, not email');
    assert.equal(get('SELECT COUNT(*) AS n FROM friends').n, n0 + 2);
    await emit(p.sa, 'skip', { room: p.room });
});

test('B11: the same user in two tabs never matches themselves', async () => {
    const g = await h.guest();
    const t1 = await h.connect(g.token);
    const t2 = await h.connect(g.token);
    await emit(t1, 'start_chat', {});
    const r = await emit(t2, 'start_chat', {});
    assert.equal(r.matched, false);
    await never(t1, 'matched', 300);
    await emit(t2, 'cancel_match');
    await emit(t1, 'cancel_match');
});

test('B10: ten searchers pair into five rooms with no duplicates and nobody stuck', async () => {
    const users = await Promise.all(Array.from({ length: 10 }, () => h.guest()));
    const socks = await Promise.all(users.map(u => h.connect(u.token)));
    const matched = socks.map(s => waitFor(s, 'matched', 3000));
    for (const s of socks) await emit(s, 'start_chat', {});
    const results = await Promise.all(matched);
    const rooms = new Map();
    results.forEach((m) => rooms.set(m.room, (rooms.get(m.room) || 0) + 1));
    assert.equal(rooms.size, 5);
    assert.ok([...rooms.values()].every(n => n === 2));
    assert.equal(_internals().queue.size, 0);
    await Promise.all(results.map((m, i) => emit(socks[i], 'skip', { room: m.room })));
});

test('B12: rooms are cleaned up after skips and disconnects', async () => {
    const before = _internals().rooms.size;
    for (let i = 0; i < 25; i++) {
        const p = await matchedPair(h);
        if (i % 2) await emit(p.sa, 'skip', { room: p.room });
        else { p.sa.disconnect(); p.sb.disconnect(); }
    }
    await sleep(600); // reconnect grace in tests is 300 ms
    assert.equal(_internals().rooms.size, before);
    assert.equal(_internals().rooms.bySocket.size, 0);
});

test('F7: a dropped partner can rejoin within the grace window', async () => {
    const p = await matchedPair(h);
    const reconnecting = waitFor(p.sb, 'partner_reconnecting');
    p.sa.disconnect();
    await reconnecting;
    const back = waitFor(p.sb, 'partner_back');
    const sa2 = await h.connect(p.a.token);
    const r = await emit(sa2, 'rejoin', { room: p.room });
    assert.equal(r.ok, true);
    await back;
    const got = waitFor(p.sb, 'receive_message');
    await emit(sa2, 'send_message', { room: p.room, text: 'still here' });
    assert.equal((await got).text, 'still here');
    await emit(sa2, 'skip', { room: p.room });
});

test('B3: direct rooms are for friends only', async () => {
    const a = await h.guest();
    const stranger = await h.guest();
    const sa = await h.connect(a.token);
    const me = await h.http('GET', '/api/me/export', { token: stranger.token });
    const r = await emit(sa, 'join_direct', { friendId: me.body.profile.public_id });
    assert.equal(r.error, 'not_friends');
    const r2 = await emit(sa, 'join_direct', { friendEmail: 'someone@gmail.com' });
    assert.equal(r2.error, 'not_friends');
});

test('video is locked for strangers for 30 s and signalling needs an active call', async () => {
    const p = await matchedPair(h);
    const r = await emit(p.sa, 'video_request', { room: p.room });
    assert.equal(r.error, 'video_locked');
    const s = await emit(p.sa, 'rtc_signal', { room: p.room, data: { sdp: 'x' } });
    assert.equal(s.error, 'not_in_call');
    await emit(p.sa, 'skip', { room: p.room });
});

test('extending needs both people', async () => {
    const p = await matchedPair(h);
    assert.equal((await emit(p.sb, 'extend_respond', { room: p.room, accept: true })).error, 'no_request');
    const req = waitFor(p.sb, 'extend_request');
    await emit(p.sa, 'extend_request', { room: p.room });
    await req;
    const acc = waitFor(p.sa, 'extend_accept');
    await emit(p.sb, 'extend_respond', { room: p.room, accept: true });
    const e = await acc;
    assert.ok(e.endsAt > Date.now() + 9 * 60_000);
    await emit(p.sa, 'skip', { room: p.room });
});

test('B15: message floods are throttled', async () => {
    const p = await matchedPair(h);
    const replies = await Promise.all(Array.from({ length: 40 }, (_, i) => emit(p.sa, 'send_message', { room: p.room, text: `m${i}` })));
    const limited = replies.filter(r => r.error === 'rate_limited').length;
    assert.ok(limited > 0, 'some messages are throttled');
    assert.ok(replies.filter(r => r.ok).length >= 10, 'normal burst still goes through');
    await emit(p.sa, 'skip', { room: p.room });
});

test('B16: presence goes to friends only and carries no emails', async () => {
    const p = await matchedPair(h);
    await emit(p.sa, 'enjoy', { room: p.room });
    await emit(p.sb, 'enjoy', { room: p.room });
    await emit(p.sa, 'friend_request', { room: p.room });
    const rev = waitFor(p.sa, 'revealed');
    await emit(p.sb, 'friend_respond', { room: p.room, accept: true });
    const { partner } = await rev;
    await emit(p.sa, 'skip', { room: p.room });

    const stranger = await h.connect((await h.guest()).token);
    const offline = waitFor(p.sa, 'presence');
    const strangerHears = never(stranger, 'presence', 400);
    p.sb.disconnect();
    const ev = await offline;
    assert.deepEqual(ev, { id: partner.id, online: false });
    await strangerHears;

    const sb2 = await h.connect(p.b.token);
    const online = await waitFor(p.sa, 'presence');
    assert.deepEqual(online, { id: partner.id, online: true });
    assert.ok(!JSON.stringify([ev, online]).includes('@'));
    sb2.disconnect();
});

test('F6/S3: reports are stored with context, auto-block the pair, and three reporters suspend the account', async () => {
    const target = await h.guest();
    const ts = await h.connect(target.token);
    let lastRoom;
    for (let i = 0; i < 3; i++) {
        const r = await h.guest();
        const rs = await h.connect(r.token);
        const m1 = waitFor(rs, 'matched');
        const m2 = waitFor(ts, 'matched');
        await emit(rs, 'start_chat', {});
        await emit(ts, 'start_chat', {});
        const [m] = await Promise.all([m1, m2]);
        lastRoom = m.room;
        if (i < 2) {
            const left = waitFor(ts, 'partner_left');
            const rep = await emit(rs, 'report', { room: m.room, reason: 'Harassment', note: 'test note' });
            assert.equal(rep.ok, true);
            await left;
        } else {
            const kicked = waitFor(ts, 'kicked');
            await emit(rs, 'report', { room: m.room, reason: 'Spam' });
            await kicked;
        }
    }
    assert.ok(lastRoom);
    const rows = all('SELECT reason, context FROM reports ORDER BY id DESC LIMIT 3');
    assert.equal(rows.length, 3);
    assert.equal(JSON.parse(rows[0].context).type, 'match');
    assert.ok(get('SELECT banned_until FROM users WHERE email = (SELECT reported FROM reports ORDER BY id DESC LIMIT 1)').banned_until);
    assert.ok(get("SELECT 1 AS x FROM audit_log WHERE action = 'auto_ban'"));
    const err = await h.connect(target.token, { expectError: true });
    assert.equal(err.message, 'banned');
});

test('X4: message text is never written to the database', async () => {
    const p = await matchedPair(h);
    const secret = 'zz-secret-message-9137';
    await emit(p.sa, 'send_message', { room: p.room, text: secret });
    await emit(p.sa, 'skip', { room: p.room });
    (await import('../src/events.js')).flush();
    const tables = all("SELECT name FROM sqlite_master WHERE type = 'table'").map(t => t.name);
    for (const t of tables) {
        const cols = all(`PRAGMA table_info(${t})`).map(c => c.name);
        for (const c of cols) {
            assert.equal(get(`SELECT COUNT(*) AS n FROM ${t} WHERE CAST(${c} AS TEXT) LIKE ?`, `%${secret}%`).n, 0, `${t}.${c}`);
        }
    }
});
