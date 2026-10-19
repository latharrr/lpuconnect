// X12: httpOnly cookie sessions when the API shares a site with the app.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIE_AUTH = 'true';
process.env.ALLOWED_ORIGINS = 'https://app.example.com';
const { boot } = await import('./helpers.js');

let h;
before(async () => { h = await boot(); });
after(async () => { await h.close(); });

test('login sets an httpOnly cookie that authenticates later requests', async () => {
    const r = await h.http('POST', '/api/auth/guest', { body: { gender: 'Male', consent: { age18: true, terms: true } } });
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /uc_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const jar = cookie.split(';')[0];
    const me = await h.http('GET', '/api/me', { headers: { Cookie: jar } });
    assert.equal(me.status, 200);
});

test('cookie-authenticated writes from a foreign origin are refused', async () => {
    const r = await h.http('POST', '/api/auth/guest', { body: { gender: 'Male', consent: { age18: true, terms: true } } });
    const jar = r.headers.get('set-cookie').split(';')[0];
    const bad = await h.http('PATCH', '/api/me', { body: { bio: 'x' }, headers: { Cookie: jar, Origin: 'https://evil.example' } });
    assert.equal(bad.status, 403);
    const good = await h.http('PATCH', '/api/me', { body: { bio: 'x' }, headers: { Cookie: jar, Origin: 'https://app.example.com' } });
    assert.equal(good.status, 200);
});
