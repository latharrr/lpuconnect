import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { randomHandle } from '../src/util.js';
import { get } from '../src/db.js';

let h;
before(async () => { h = await boot(); });
after(async () => { await h.close(); });

test('guest login requires age and terms consent, and stores it', async () => {
    const r = await h.http('POST', '/api/auth/guest', { body: { gender: 'Male' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'consent_required');
    const bad = await h.http('POST', '/api/auth/guest', { body: { gender: 'Robot', consent: { age18: true, terms: true } } });
    assert.equal(bad.status, 400);
    const ok = await h.guest('Other');
    assert.ok(ok.token);
    assert.equal(ok.user.email, null, 'guest email is never exposed');
    const n = get("SELECT COUNT(*) AS n FROM consents WHERE kind IN ('age_18', 'terms', 'privacy')").n;
    assert.ok(n >= 3);
});

test('B1: the email-only resume endpoint is gone and resume needs a valid token', async () => {
    const g = await h.guest();
    const legacy = await h.http('POST', '/api/login/resume', { body: { email: 'someone@gmail.com' } });
    assert.equal(legacy.status, 404);
    const noToken = await h.http('POST', '/api/auth/resume', { body: { email: 'x@y.z' } });
    assert.equal(noToken.status, 401);
    const r = await h.http('POST', '/api/auth/resume', { token: g.token });
    assert.equal(r.status, 200);
    assert.notEqual(r.body.token, g.token, 'token rotates');
    const reuse = await h.http('POST', '/api/auth/resume', { token: g.token });
    assert.equal(reuse.status, 401, 'old token is revoked');
    const fresh = await h.http('GET', '/api/me', { token: r.body.token });
    assert.equal(fresh.status, 200);
});

test('B2: bio edits need a token, ignore any email in the body, and are length-capped', async () => {
    const a = await h.guest();
    const b = await h.guest();
    const anon = await h.http('PATCH', '/api/me', { body: { bio: 'hacked' } });
    assert.equal(anon.status, 401);
    const legacy = await h.http('POST', '/api/profile/bio', { body: { email: 'x', bio: 'hacked' } });
    assert.equal(legacy.status, 404);
    const r = await h.http('PATCH', '/api/me', { token: a.token, body: { bio: 'x'.repeat(500), email: 'victim@uniconnect.local' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.bio.length, 200);
    const other = await h.http('GET', '/api/me', { token: b.token });
    assert.equal(other.body.user.bio, '');
});

test('B18: guest handles come from crypto and do not collide over 100k draws', () => {
    const seen = new Set();
    for (let i = 0; i < 100_000; i++) seen.add(randomHandle(12));
    assert.equal(seen.size, 100_000);
});

test('S8: a device ban blocks a fresh guest account from the same device', async () => {
    const g = await h.guest('Male', { deviceId: 'device-abc' });
    const admin = (await h.http('POST', '/admin/api/login', { body: { devToken: 'test-admin' } })).body.token;
    const me = get('SELECT public_id FROM users WHERE device_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1');
    const mod = await h.http('POST', `/admin/api/users/${me.public_id}/moderate`, { token: admin, body: { action: 'timeout', hours: 24, reason: 'test' } });
    assert.equal(mod.status, 200);
    const again = await h.http('POST', '/api/auth/guest', { body: { gender: 'Male', deviceId: 'device-abc', consent: { age18: true, terms: true } } });
    assert.equal(again.status, 403);
    const banned = await h.http('GET', '/api/me', { token: g.token });
    assert.equal(banned.status, 403);
    const other = await h.http('POST', '/api/auth/guest', { body: { gender: 'Male', deviceId: 'device-xyz', consent: { age18: true, terms: true } } });
    assert.equal(other.status, 200);
});

test('X5: a user can export and delete their own data', async () => {
    const g = await h.guest();
    const exp = await h.http('GET', '/api/me/export', { token: g.token });
    assert.equal(exp.status, 200);
    assert.ok(exp.body.profile.public_id);
    assert.equal(exp.body.profile.device_hash, undefined);
    const del = await h.http('DELETE', '/api/me', { token: g.token });
    assert.equal(del.status, 200);
    const after = await h.http('GET', '/api/me', { token: g.token });
    assert.equal(after.status, 401);
    assert.equal(get('SELECT COUNT(*) AS n FROM users WHERE public_id = ?', exp.body.profile.public_id).n, 0);
});

test('TURN credentials are short-lived and only for signed-in users', async () => {
    const anon = await h.http('GET', '/api/turn');
    assert.equal(anon.status, 401);
    const g = await h.guest();
    const r = await h.http('GET', '/api/turn', { token: g.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.ttl <= 3600);
    assert.ok(r.body.iceServers[0].urls.length);
    assert.ok(!JSON.stringify(r.body).includes('openrelayproject'));
});

test('client events: only allow-listed names, never text', async () => {
    const r = await h.http('POST', '/api/events', { body: { events: [
        { event: 'landing_view', sessionId: 's1', ref: 'poster1', props: { text: 'secret', w: 390 } },
        { event: 'match_made', sessionId: 's1' },
    ] } });
    assert.equal(r.status, 204);
    const { flush } = await import('../src/events.js');
    flush();
    const rows = (await import('../src/db.js')).all("SELECT event, props FROM events WHERE session_id = 's1'");
    assert.deepEqual(rows.map(x => x.event), ['landing_view']);
    assert.ok(!rows[0].props.includes('secret'));
});
