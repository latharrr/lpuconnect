// Persisted session tokens. Only a SHA-256 of each token is stored, so a leaked
// database row cannot be replayed. Lookup is a primary-key hit (O(1)).
import crypto from 'node:crypto';
import { run, get } from './db.js';
import { config } from './config.js';
import { sha256, now } from './util.js';

export function createSession(email, kind = 'user', ttlMs = config.sessionTtlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    run('INSERT INTO sessions (token_hash, email, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        sha256(token), email, kind, t, t + ttlMs);
    return token;
}

export function validateSession(token, kind = 'user') {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const row = get('SELECT email, kind, expires_at FROM sessions WHERE token_hash = ?', sha256(token));
    if (!row || row.kind !== kind) return null;
    if (row.expires_at < now()) {
        run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
        return null;
    }
    return row.email;
}

// Refresh: the old token is revoked and a fresh one issued.
export function rotateSession(token, kind = 'user') {
    const email = validateSession(token, kind);
    if (!email) return null;
    revokeSession(token);
    return { email, token: createSession(email, kind) };
}

export function revokeSession(token) {
    if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function revokeAllFor(email) {
    run('DELETE FROM sessions WHERE email = ?', email);
}

export function purgeExpiredSessions() {
    return run('DELETE FROM sessions WHERE expires_at < ?', now()).changes;
}

export function bearer(req) {
    const h = req.get('authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
