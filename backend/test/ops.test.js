import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { boot } from './helpers.js';
import { run, get, all, schemaSnapshot } from '../src/db.js';
import { rollupDay, purgeRetention, backupNow, dayKey, spikeCheck } from '../src/jobs.js';
import { track, flush } from '../src/events.js';
import { toCsv } from '../src/admin/metrics.js';

let h;
let admin;
before(async () => {
    h = await boot();
    admin = (await h.http('POST', '/admin/api/login', { body: { devToken: 'test-admin' } })).body.token;
});
after(async () => { await h.close(); });

test('R1: /health answers fast with JSON', async () => {
    const t = Date.now();
    const r = await h.http('GET', '/health');
    assert.equal(r.status, 200);
    assert.ok(Date.now() - t < 200);
    assert.equal(r.body.db, 'ok');
    for (const k of ['memoryMb', 'queue', 'rooms', 'sockets', 'eventLoopLagMs', 'cache']) assert.ok(k in r.body, k);
});

test('R11: a v1 database and a fresh database migrate to the same schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-mig-'));
    const legacy = path.join(dir, 'legacy.sqlite');
    const v1 = new DatabaseSync(legacy);
    v1.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, gender TEXT, bio TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
             CREATE TABLE friends (user_id_1 TEXT, user_id_2 TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id_1, user_id_2));
             INSERT INTO users (id, email, name, gender) VALUES ('a@x.com', 'a@x.com', 'A', 'Male');`);
    v1.close();
    const names = (file) => {
        const db = new DatabaseSync(file);
        const migrations = fs.readdirSync(path.join(import.meta.dirname, '..', 'migrations')).sort();
        db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT)');
        for (const f of migrations) db.exec(fs.readFileSync(path.join(import.meta.dirname, '..', 'migrations', f), 'utf8'));
        const out = db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all().map(r => `${r.type}:${r.name}`);
        const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
        db.close();
        return { out, cols };
    };
    const a = names(legacy);
    const b = names(path.join(dir, 'fresh.sqlite'));
    assert.deepEqual(a, b);
    assert.ok(schemaSnapshot().length > 0);
});

test('X13: the events table has no email column', () => {
    const cols = all('PRAGMA table_info(events)').map(c => c.name);
    assert.ok(!cols.includes('email'));
});

test('2.3: nightly rollup writes daily_stats', async () => {
    const g = await h.guest();
    track('match_made', { email: (await h.http('GET', '/api/me/export', { token: g.token })).body.profile.email, props: { wait_ms: 4000 } });
    flush();
    const day = dayKey(Date.now());
    const m = rollupDay(day);
    assert.ok(m.logins >= 1);
    assert.ok(get('SELECT COUNT(*) AS n FROM daily_stats WHERE day = ?', day).n >= 5);
});

test('X6: retention purge removes old events and closed reports only', () => {
    const old = Date.now() - 200 * 86_400_000;
    run("INSERT INTO events (ts, event) VALUES (?, 'landing_view')", old);
    run("INSERT INTO reports (ts, reporter, reported, reason, status) VALUES (?, 'a', 'b', 'Spam', 'open')", old - 400 * 86_400_000);
    run("INSERT INTO reports (ts, reporter, reported, reason, status) VALUES (?, 'a', 'b', 'Spam', 'resolved')", old - 400 * 86_400_000);
    const counts = purgeRetention();
    assert.ok(counts.events >= 1);
    assert.equal(counts.reports, 1, 'open reports are kept for review');
});

test('R3: a backup restores with matching row counts', () => {
    const file = backupNow();
    const copy = new DatabaseSync(file, { readOnly: true });
    for (const t of ['users', 'friends', 'events', 'reports', 'sessions']) {
        assert.equal(copy.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, get(`SELECT COUNT(*) AS n FROM ${t}`).n, t);
    }
    copy.close();
});

test('X11: admin routes refuse anyone without an admin session', async () => {
    const g = await h.guest();
    for (const url of ['/admin/api/overview', '/admin/api/reports', '/admin/api/users', '/admin/api/export/events']) {
        assert.equal((await h.http('GET', url)).status, 403, url);
        assert.equal((await h.http('GET', url, { token: g.token })).status, 403, `${url} with user token`);
    }
    assert.equal((await h.http('POST', '/admin/api/login', { body: { devToken: 'wrong' } })).status, 501);
});

test('2.2: admin pages return numbers with the SQL that produced them', async () => {
    const o = await h.http('GET', '/admin/api/overview', { token: admin });
    assert.equal(o.status, 200);
    for (const k of ['dau', 'wau', 'mau', 'matchesToday', 'medianWaitMs', 'enjoyRate']) {
        assert.ok(k in o.body, k);
        assert.ok(typeof o.body[k].sql === 'string', `${k}.sql`);
    }
    const dauDirect = get("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts >= ? AND user_id IS NOT NULL AND user_id != 'deleted'", Date.now() - 86_400_000).n;
    assert.equal(o.body.dau.value, dauDirect, 'reconciles with raw SQL');
    for (const url of ['/admin/api/funnel?days=7', '/admin/api/dropoff', '/admin/api/quality', '/admin/api/cohorts', '/admin/api/live', '/admin/api/settings', '/admin/api/audit', '/admin/api/referrals']) {
        assert.equal((await h.http('GET', url, { token: admin })).status, 200, url);
    }
});

test('CSV export matches the table and neutralises formulas', async () => {
    const r = await h.http('POST', '/admin/api/referrals', { token: admin, body: { label: '=HYPERLINK("x")', code: 'poster1' } });
    assert.equal(r.status, 200);
    const csv = await fetch(`${h.base}/admin/api/export/referrals.csv`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
    assert.ok(csv.startsWith('code,label,created_at'));
    assert.ok(csv.includes("'=HYPERLINK"), 'formula is escaped');
    assert.equal(csv.trim().split('\n').length - 1, get('SELECT COUNT(*) AS n FROM referrals').n);
    assert.equal(toCsv([{ a: 'x,y', b: null }]), 'a,b\n"x,y",\n');
    assert.ok(get("SELECT 1 AS x FROM audit_log WHERE action = 'export'"));
});

test('S9: the audit log is append-only', () => {
    assert.throws(() => run("UPDATE audit_log SET actor = 'x'"));
    assert.throws(() => run('DELETE FROM audit_log'));
});

test('S3: auto-ban threshold is configurable from admin', async () => {
    const r = await h.http('POST', '/admin/api/settings', { token: admin, body: { autoban_reports: 5 } });
    assert.equal(r.body.settings.autoban_reports, 5);
    const bad = await h.http('POST', '/admin/api/settings', { token: admin, body: { nope: 1 } });
    assert.equal(bad.status, 400);
});

test('alerts: spike check runs without a webhook', async () => {
    const fired = await spikeCheck();
    assert.ok(Array.isArray(fired));
});
