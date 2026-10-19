import crypto from 'node:crypto';
import { config } from './config.js';

export const now = () => Date.now();
export const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');

// Guest handles: unguessable, readable, no Math.random.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function randomHandle(len) {
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

// Pseudonymous analytics id: never the email, not reversible without the salt.
export const analyticsId = (publicId) => (publicId ? hmac(config.analyticsSalt, publicId).slice(0, 24) : null);
export const deviceHash = (deviceId) => (deviceId ? hmac(config.deviceSalt, String(deviceId).slice(0, 128)).slice(0, 32) : null);

// Anonymous per-match alias shown to a stranger before reveal.
const ADJ = ['Quiet', 'Curious', 'Sleepy', 'Bright', 'Late', 'Early', 'Lucky', 'Calm', 'Bold', 'Swift', 'Mellow', 'Witty'];
const NOUN = ['Owl', 'Fox', 'Comet', 'Kite', 'Moth', 'Otter', 'Lark', 'Pine', 'Wren', 'Heron', 'Lynx', 'Finch'];
export function randomAlias() {
    const b = crypto.randomBytes(3);
    return `${ADJ[b[0] % ADJ.length]} ${NOUN[b[1] % NOUN.length]} ${10 + (b[2] % 90)}`;
}

export function clampText(s, max) {
    if (typeof s !== 'string') return '';
    return s.replace(/\u0000/g, '').trim().slice(0, max);
}

export const isGuestEmail = (email) => typeof email === 'string' && email.endsWith('@uniconnect.local');

export function safeJson(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}
