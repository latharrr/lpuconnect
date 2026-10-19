import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { run, get, tx } from '../db.js';
import { createSession, rotateSession, revokeSession, bearer, validateSession, setSessionCookie } from '../sessions.js';
import { getUser, invalidateUser, selfView, friendsOf, banState, deviceBanned } from '../users.js';
import { track } from '../events.js';
import { HttpError } from '../errors.js';
import { randomHandle, deviceHash, now, clampText } from '../util.js';

export const TERMS_VERSION = '2026-10-19';
const GENDERS = new Set(['Male', 'Female', 'Other']);
const google = new OAuth2Client();

// Requires a valid user session. Banned users may still export or delete their data.
export function requireAuth({ allowBanned = false } = {}) {
    return (req, _res, next) => {
        const email = validateSession(bearer(req));
        if (!email) return next(new HttpError(401, 'unauthorized'));
        const user = getUser(email);
        if (!user) return next(new HttpError(401, 'unauthorized'));
        const ban = banState(user);
        if (ban && !allowBanned) return next(new HttpError(403, 'banned', `Suspended until ${ban.until}`));
        req.email = email;
        req.user = user;
        next();
    };
}

function readConsent(body) {
    const c = body?.consent || {};
    if (c.age18 !== true || c.terms !== true) {
        throw new HttpError(400, 'consent_required', 'Confirm you are 18 or older and accept the terms and privacy notice.');
    }
}

function recordConsent(email) {
    const at = new Date().toISOString();
    for (const kind of ['age_18', 'terms', 'privacy']) {
        run('INSERT INTO consents (email, kind, version, accepted_at) VALUES (?, ?, ?, ?)', email, kind, TERMS_VERSION, at);
    }
    run('UPDATE users SET consent_at = ?, age_confirmed = 1, terms_version = ? WHERE email = ?', at, TERMS_VERSION, email);
}

function respond(res, email, extra = {}) {
    if (extra.token) setSessionCookie(res, extra.token);
    invalidateUser(email);
    const user = getUser(email);
    res.json({ user: selfView(user), friends: friendsOf(email), ...extra });
}

const refOf = (body) => clampText(body?.ref || '', 40).replace(/[^\w-]/g, '') || null;

export const authRouter = Router();

authRouter.post('/guest', (req, res) => {
    const { gender, deviceId, appVersion } = req.body || {};
    if (!GENDERS.has(gender)) throw new HttpError(400, 'bad_gender');
    readConsent(req.body);
    const dh = deviceHash(deviceId);
    const ban = deviceBanned(dh);
    if (ban) throw new HttpError(403, 'banned', `Suspended until ${new Date(ban.until).toISOString()}`);

    const handle = randomHandle(12);
    const email = `guest_${handle}@uniconnect.local`;
    const ref = refOf(req.body);
    tx(() => {
        run(`INSERT INTO users (id, email, name, gender, public_id, auth_provider, device_hash, ref, last_seen)
             VALUES (?, ?, ?, ?, lower(hex(randomblob(12))), 'guest', ?, ?, ?)`,
            email, email, `Guest-${handle.slice(0, 6)}`, gender, dh, ref, new Date().toISOString());
        recordConsent(email);
    });
    track('guest_login', { email, ref, device: req.get('user-agent')?.includes('Android') ? 'android' : 'web', appVersion });
    track('consent_given', { email });
    respond(res, email, { token: createSession(email) });
});

authRouter.post('/google', async (req, res) => {
    if (!config.googleClientId) throw new HttpError(501, 'google_not_configured');
    const { idToken, gender, deviceId, appVersion } = req.body || {};
    let payload;
    try {
        const ticket = await google.verifyIdToken({ idToken, audience: config.googleClientId });
        payload = ticket.getPayload();
    } catch {
        throw new HttpError(401, 'bad_google_token');
    }
    if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'email_not_verified');
    const email = payload.email.toLowerCase();
    const domain = (payload.hd || email.split('@')[1] || '').toLowerCase();
    const verified = config.verifiedDomains.includes(domain) ? 1 : 0;
    const dh = deviceHash(deviceId);

    const existing = get('SELECT * FROM users WHERE email = ?', email);
    if (!existing) {
        if (!GENDERS.has(gender)) throw new HttpError(400, 'bad_gender');
        readConsent(req.body);
        if (deviceBanned(dh)) throw new HttpError(403, 'banned');
        tx(() => {
            run(`INSERT INTO users (id, email, name, gender, public_id, auth_provider, verified, device_hash, ref, last_seen)
                 VALUES (?, ?, ?, ?, lower(hex(randomblob(12))), 'google', ?, ?, ?, ?)`,
                email, email, clampText(payload.name || email.split('@')[0], 60), gender, verified, dh, refOf(req.body), new Date().toISOString());
            recordConsent(email);
        });
    } else {
        // Gender is a self-described preference set once; it is not overwritten on later logins.
        run('UPDATE users SET name = ?, verified = ?, auth_provider = ?, device_hash = COALESCE(?, device_hash), last_seen = ? WHERE email = ?',
            clampText(payload.name || existing.name, 60), verified, 'google', dh, new Date().toISOString(), email);
        if (!existing.consent_at) { readConsent(req.body); recordConsent(email); }
    }
    invalidateUser(email);
    const ban = banState(getUser(email));
    if (ban) throw new HttpError(403, 'banned', `Suspended until ${ban.until}`);
    track('google_login', { email, props: { verified }, appVersion });
    respond(res, email, { token: createSession(email) });
});

// Resume with the stored token only. The old token is revoked and a fresh one returned.
authRouter.post('/resume', (req, res) => {
    const rotated = rotateSession(bearer(req));
    if (!rotated) throw new HttpError(401, 'unauthorized');
    const user = getUser(rotated.email);
    if (!user) throw new HttpError(401, 'unauthorized');
    const ban = banState(user);
    if (ban) {
        revokeSession(rotated.token);
        setSessionCookie(res, null);
        throw new HttpError(403, 'banned', `Suspended until ${ban.until}`);
    }
    run('UPDATE users SET last_seen = ? WHERE email = ?', new Date(now()).toISOString(), rotated.email);
    track('resume_login', { email: rotated.email });
    respond(res, rotated.email, { token: rotated.token });
});

authRouter.post('/logout', (req, res) => {
    revokeSession(bearer(req));
    setSessionCookie(res, null);
    res.json({ ok: true });
});
