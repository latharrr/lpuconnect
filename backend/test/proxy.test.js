// B19: behind nginx, each real client IP gets its own rate-limit bucket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.TRUST_PROXY = '1';
process.env.TEST_RATE_LIMITS = '1';
const { boot } = await import('./helpers.js');

let h;
before(async () => { h = await boot(); });
after(async () => { await h.close(); });

test('different forwarded IPs get separate login buckets', async () => {
    const hit = (ip) => h.http('POST', '/api/auth/guest', { body: { gender: 'Robot' }, headers: { 'X-Forwarded-For': ip } });
    const a = [];
    for (let i = 0; i < 12; i++) a.push((await hit('10.0.0.1')).status);
    assert.ok(a.includes(429), 'one client is throttled after 10 tries a minute');
    assert.equal((await hit('10.0.0.2')).status, 400, 'a different client is not');
});
