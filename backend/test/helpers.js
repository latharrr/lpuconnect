// Shared test harness: in-memory DB, real HTTP server and real Socket.IO clients.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.DB_PATH ??= ':memory:';
process.env.RECONNECT_GRACE_MS ??= '300';
process.env.ADMIN_DEV_TOKEN ??= 'test-admin';
process.env.BACKUP_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'uc-backup-'));
process.env.ANALYTICS_SALT ??= 'test-salt';
process.env.DEVICE_SALT ??= 'test-device-salt';
process.env.OTP_ENABLED ??= 'true';
process.env.OTP_SENDER ??= 'dry';
process.env.OTP_MIN_SEND_GAP_MS ??= '0';

const { start, stop } = await import('../server.js');
const { io: ioc } = await import('socket.io-client');

export async function boot() {
    const server = await start({ port: 0 });
    const base = `http://127.0.0.1:${server.address().port}`;
    const sockets = [];

    async function http(method, url, { token, body, headers = {} } = {}) {
        const res = await fetch(base + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        return { status: res.status, body: json, headers: res.headers };
    }

    async function guest(gender = 'Male', extra = {}) {
        const r = await http('POST', '/api/auth/guest', { body: { gender, consent: { age18: true, terms: true }, ...extra } });
        if (r.status !== 200) throw new Error(`guest login failed: ${r.status} ${JSON.stringify(r.body)}`);
        return r.body;
    }

    function connect(token, { expectError = false } = {}) {
        const s = ioc(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
        sockets.push(s);
        return new Promise((resolve, reject) => {
            s.once('connect', () => (expectError ? reject(new Error('connected unexpectedly')) : resolve(s)));
            s.once('connect_error', (err) => (expectError ? resolve(err) : reject(err)));
        });
    }

    async function close() {
        sockets.forEach(s => s.disconnect());
        await stop(server);
    }

    return { server, base, http, guest, connect, close };
}

export const emit = (socket, event, data = {}) => new Promise((resolve) => socket.emit(event, data, resolve));

export function waitFor(socket, event, ms = 2000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
        socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
    });
}

export function never(socket, event, ms = 300) {
    return new Promise((resolve, reject) => {
        const handler = (p) => { clearTimeout(t); reject(new Error(`unexpected ${event}: ${JSON.stringify(p)}`)); };
        const t = setTimeout(() => { socket.off(event, handler); resolve(); }, ms);
        socket.once(event, handler);
    });
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Two fresh guests, connected and matched.
export async function matchedPair(h) {
    const a = await h.guest('Male');
    const b = await h.guest('Female');
    const sa = await h.connect(a.token);
    const sb = await h.connect(b.token);
    const pa = waitFor(sa, 'matched');
    const pb = waitFor(sb, 'matched');
    await emit(sa, 'start_chat', {});
    await emit(sb, 'start_chat', {});
    const [ma, mb] = await Promise.all([pa, pb]);
    return { a, b, sa, sb, ma, mb, room: ma.room };
}
