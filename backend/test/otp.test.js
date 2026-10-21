import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { get, run } from '../src/db.js';
import { dryOutbox, __test } from '../src/otp.js';

let h;
before(async () => { h = await boot(); });
after(async () => { await h.close(); });

const CONSENT = { age18: true, terms: true };
let seq = 0;
const phone = () => `+9182210${String(16809 + seq++).padStart(5, '0')}`.slice(0, 13);

async function requestAndCode(ph) {
    const r = await h.http('POST', '/api/auth/otp/request', { body: { phone: ph } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const msg = dryOutbox.filter((m) => m.phone === ph).at(-1);
    assert.ok(msg, 'dry outbox has the message');
    const code = msg.text.match(/\b(\d{6})\b/)?.[1];
    assert.ok(code, 'message contains a 6-digit code');
    return { session: r.body.session, code };
}

test('otp: full phone login creates an anonymous whatsapp user', async () => {
    const ph = phone();
    const { session, code } = await requestAndCode(ph);
    const bad = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session, code, gender: 'Male' } });
    assert.equal(bad.status, 400, 'consent required for a new account');
    const r = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session, code, gender: 'Male', consent: CONSENT } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
    assert.equal(r.body.user.provider, 'whatsapp');
    assert.equal(r.body.user.email, null, 'marker email is never exposed');
    const row = get('SELECT * FROM users WHERE phone_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1');
    assert.ok(row.phone_hash);
    assert.ok(!JSON.stringify(row).includes(ph.slice(3)), 'no plaintext phone anywhere in the user row');
});

test('otp: normalization - 10 digits, 91- and +91-forms hit the same account limits', async () => {
    const base = `85530${String(40000 + seq++).slice(0, 5)}`;
    const r1 = await h.http('POST', '/api/auth/otp/request', { body: { phone: base } });
    assert.equal(r1.status, 200);
    const r2 = await h.http('POST', '/api/auth/otp/request', { body: { phone: `+91 ${base.slice(0, 5)} ${base.slice(5)}` } });
    assert.equal(r2.status, 429, 'same number in another format is the same number');
    const bad = await h.http('POST', '/api/auth/otp/request', { body: { phone: '12345' } });
    assert.equal(bad.status, 400);
});

test('otp: wrong code consumes attempts and the cap invalidates the code', async () => {
    const ph = phone();
    const { session } = await requestAndCode(ph);
    for (let i = 0; i < 5; i++) {
        const r = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session, code: '000000', gender: 'Male', consent: CONSENT } });
        assert.equal(r.status, 401, `attempt ${i + 1}`);
    }
    const r = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session, code: '000000', gender: 'Male', consent: CONSENT } });
    assert.equal(r.status, 429, 'sixth attempt is refused');
});

test('otp: code is bound to its session and expires', async () => {
    const ph = phone();
    const { session, code } = await requestAndCode(ph);
    const wrongSession = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session: 'not-the-session', code, gender: 'Male', consent: CONSENT } });
    assert.equal(wrongSession.status, 401);
    run('UPDATE otp_codes SET expires_at = ? WHERE session_id = ?', Date.now() - 1000, session);
    const expired = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session, code, gender: 'Male', consent: CONSENT } });
    assert.equal(expired.status, 410);
});

test('otp: returning phone user lands on the same account', async () => {
    const ph = phone();
    const first = await requestAndCode(ph);
    const r1 = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session: first.session, code: first.code, gender: 'Female', consent: CONSENT } });
    assert.equal(r1.status, 200);
    // second login another day: age the rows past the resend gap
    run('UPDATE otp_codes SET created_at = created_at - 90000 WHERE session_id = ?', first.session);
    const second = await requestAndCode(ph);
    const r2 = await h.http('POST', '/api/auth/otp/verify', { body: { phone: ph, session: second.session, code: second.code, consent: CONSENT } });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(r2.body.user.name, r1.body.user.name, 'same account');
});

test('otp: per-number daily cap (3) blocks the fourth request', async () => {
    const ph = phone();
    for (let i = 0; i < 3; i++) {
        const r = await h.http('POST', '/api/auth/otp/request', { body: { phone: ph } });
        assert.equal(r.status, 200, `send ${i + 1}`);
        run('UPDATE otp_codes SET created_at = created_at - 61000 WHERE phone_hash = (SELECT phone_hash FROM otp_codes ORDER BY id DESC LIMIT 1)');
    }
    const r = await h.http('POST', '/api/auth/otp/request', { body: { phone: ph } });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'otp_daily_number_cap');
});

test('otp: kill switch engages on repeated send failures', () => {
    for (let i = 0; i < 5; i++) __test.recordOutcome({ ok: false, kind: 'send_failed' });
    assert.equal(__test.state.disabled, true, 'kill switch engaged');
    __test.state.disabled = false;
    __test.state.outcomes.length = 0;
});

test('otp: codes are stored only as HMACs', async () => {
    const ph = phone();
    const { session, code } = await requestAndCode(ph);
    const row = get('SELECT * FROM otp_codes WHERE session_id = ?', session);
    assert.ok(row);
    assert.ok(!row.code_hmac.includes(code), 'code never stored in plaintext');
    assert.ok(!row.phone_hash.includes(ph.slice(3)), 'phone never stored in plaintext');
});
