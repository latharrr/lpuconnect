// Load test (spec P11). Simulates N students per stage: guest login, socket connect,
// search, match, a short conversation, skip. Records p50/p95 time-to-match, failures,
// and server CPU / RSS / event-loop lag.
//
//   node scripts/loadtest.mjs                      # spawns a local test server
//   node scripts/loadtest.mjs --url https://api... # against a running server (set AUTH_RATE_LIMIT high there)
//   --stages 100,500,1000,2000  --msgs 20  --out ../docs/loadtest-results.json
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { io } from 'socket.io-client';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STAGES = arg('stages', '100,500,1000,2000').split(',').map(Number);
const MSGS = Number(arg('msgs', 20));
const OUT = arg('out', null);
let BASE = arg('url', null);
let child = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pctl = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
        cwd: new URL('..', import.meta.url).pathname,
        env: { ...process.env, NODE_ENV: 'test', DB_PATH: ':memory:', LOG_LEVEL: 'silent', PORT: '3999', ANALYTICS_SALT: 'lt', DEVICE_SALT: 'lt' },
        stdio: 'ignore',
    });
    BASE = 'http://127.0.0.1:3999';
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* booting */ }
        await sleep(100);
    }
    throw new Error('server did not start');
}

function procStats() {
    if (!child) return null;
    try {
        const [cpu, rss] = execFileSync('ps', ['-o', '%cpu=,rss=', '-p', String(child.pid)]).toString().trim().split(/\s+/).map(Number);
        return { cpu, rssMb: Math.round(rss / 1024) };
    } catch { return null; }
}

async function pool(n, limit, fn) {
    const out = new Array(n);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, n) }, async () => { while (i < n) { const k = i++; out[k] = await fn(k); } }));
    return out;
}

async function stage(n) {
    // Spread loopback clients over 127.0.0.1-8: one (srcIP,srcPort,dstIP,dstPort)
    // tuple per connection, so >64k concurrent sockets do not exhaust one
    // ephemeral port range (single-IP testing caps at ~28k conns).
    const bases = BASE === "http://127.0.0.1:3999"
        ? Array.from({ length: 8 }, (_, i) => `http://127.0.0.${i + 1}:3999`)
        : [BASE];
    const tokens = await pool(n, 40, async (k) => {
        const r = await fetch(`${bases[k % bases.length]}/api/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gender: 'Other', consent: { age18: true, terms: true } }) });
        return r.ok ? (await r.json()).token : null;
    });
    const valid = tokens.filter(Boolean);
    const sockets = await pool(valid.length, 100, (k) => new Promise((resolve) => {
        const s = io(bases[k % bases.length], { auth: { token: valid[k] }, transports: ['websocket'], reconnection: false, forceNew: true });
        s.once('connect', () => resolve(s));
        s.once('connect_error', () => resolve(null));
    }));
    const live = sockets.filter(Boolean);

    const samples = [];
    const sampler = setInterval(async () => {
        try {
            const h = await (await fetch(`${BASE}/health`)).json();
            samples.push({ lag: h.eventLoopLagMs, heap: h.memoryMb.heapUsed, rss: h.memoryMb.rss, ...procStats() });
        } catch { /* ignore */ }
    }, 500);

    const latencies = [];
    let failed = 0;
    let delivered = 0;
    await Promise.all(live.map((s, idx) => new Promise((resolve) => {
        const t0 = Date.now();
        const timer = setTimeout(() => { failed++; resolve(); }, 20_000);
        s.on('receive_message', () => { delivered++; });
        s.once('matched', async (m) => {
            clearTimeout(timer);
            latencies.push(Date.now() - t0);
            for (let i = 0; i < MSGS / 2; i++) {
                s.emit('send_message', { room: m.room, text: `message ${i} from ${idx}` });
                await sleep(250);
            }
            await sleep(500);
            s.emit('skip', { room: m.room });
            resolve();
        });
        setTimeout(() => s.emit('start_chat', {}), Math.random() * 2000);
    })));
    clearInterval(sampler);
    live.forEach(s => s.disconnect());
    await sleep(1500);

    const max = (k) => Math.max(0, ...samples.map(x => x[k] ?? 0));
    return {
        users: n, loggedIn: valid.length, connected: live.length, matched: latencies.length, failed,
        matchMs: { p50: pctl(latencies, 0.5), p95: pctl(latencies, 0.95), max: Math.max(0, ...latencies) },
        messagesDelivered: delivered,
        server: { peakCpuPct: max('cpu'), peakRssMb: max('rssMb') || max('rss'), peakHeapMb: max('heap'), peakLoopLagMs: max('lag') },
    };
}

if (!BASE) await startServer();
const results = [];
for (const n of STAGES) {
    process.stdout.write(`stage ${n}… `);
    const r = await stage(n);
    results.push(r);
    console.log(`matched ${r.matched}/${r.connected}, p95 ${r.matchMs.p95} ms, cpu ${r.server.peakCpuPct}%, rss ${r.server.peakRssMb} MB, lag ${r.server.peakLoopLagMs} ms`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: child ? 'local child process' : BASE, node: process.version, results }, null, 2));
child?.kill('SIGTERM');
process.exit(0);
