// Post-boot smoke test: /health is green and a real guest can log in and open a socket.
// Usage: node deploy/smoke.mjs http://127.0.0.1:3199
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { io } = require('socket.io-client');
const base = process.argv[2] || 'http://127.0.0.1:3001';
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };

const t0 = Date.now();
const health = await fetch(`${base}/health`).catch(() => null);
if (!health?.ok) fail(`/health returned ${health?.status ?? 'no response'}`);
const h = await health.json();
if (h.db !== 'ok') fail('database not reachable');

const login = await fetch(`${base}/api/auth/guest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gender: 'Other', consent: { age18: true, terms: true }, deviceId: 'smoke-test' }),
});
if (!login.ok) fail(`guest login returned ${login.status}`);
const { token } = await login.json();

await new Promise((resolve) => {
    const s = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 });
    const timer = setTimeout(() => fail('socket handshake timed out'), 6000);
    s.once('hello', () => { clearTimeout(timer); s.disconnect(); resolve(); });
    s.once('connect_error', (e) => fail(`socket: ${e.message}`));
});
await fetch(`${base}/api/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
console.log(`SMOKE OK in ${Date.now() - t0} ms (release ${h.release})`);
process.exit(0);
