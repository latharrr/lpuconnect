// WhatsApp OTP login: request -> verify, with a pluggable sender.
// Senders: 'dry' (log/capture only, default outside prod), 'openwa' (Labs relay
// /admin/send over HMAC), 'cloudapi' (stub until the official API is approved).
// Ban-minimizing rules for the unofficial bridge sender live here: global daily
// cap, per-number and per-IP limits, a serial queue with a human-like delay, and
// an automatic kill switch on error spikes.
import crypto from 'node:crypto';
import { config } from './config.js';
import { run, get, all } from './db.js';
import { logger } from './logger.js';
import { sendAlert } from './alerts.js';
import { HttpError } from './errors.js';

const OTP_TEXTS = [
    (code, mins) => `LpuTV login code: ${code}. Valid for ${mins} minutes. Don't share it with anyone.`,
    (code, mins) => `${code} is your LpuTV code. It expires in ${mins} minutes.`,
    (code, mins) => `Your LpuTV verification code is ${code} (valid ${mins} min). Never share it.`,
    (code, mins) => `${code} - LpuTV login code, expires in ${mins} minutes.`,
];

// India only for now: accepts 10 digits, or 91/0/+91 prefixed forms. Returns '+91XXXXXXXXXX' or null.
export function normalizePhone(raw) {
    if (!raw) return null;
    let d = String(raw).replace(/[^\d]/g, '');
    if (d.startsWith('0')) d = d.slice(1);
    if (d.startsWith('91') && d.length === 12) d = d.slice(2);
    if (!/^[6-9]\d{9}$/.test(d)) return null;
    return `+91${d}`;
}

const hmac = (s) => crypto.createHmac('sha256', config.otp.hashSalt).update(s).digest('hex');
export const phoneHash = (phone) => hmac(`phone:${phone}`);
const codeHmac = (phone, sessionId, code) => hmac(`otp:${phone}:${sessionId}:${code}`);

// --- senders ---------------------------------------------------------------

// Dry sender: never sends anywhere; captures the message for dev/tests.
export const dryOutbox = [];
async function sendDry(phone, text) {
    dryOutbox.push({ phone, text, at: Date.now() });
    logger.info({ phone }, 'otp dry send (not delivered)');
    return { ok: true, dry: true };
}

async function sendOpenWA(phone, text) {
    const chat = `${phone.slice(1)}@c.us`;
    const body = JSON.stringify({ chat, text });
    const sig = 'sha256=' + crypto.createHmac('sha256', config.otp.openwaSecret).update(body).digest('hex');
    let res;
    try {
        res = await fetch(config.otp.openwaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Relay-Signature': sig },
            body,
            signal: AbortSignal.timeout(15_000),
        });
    } catch (err) {
        return { ok: false, kind: 'send_failed', error: String(err) };
    }
    if (res.status === 200) {
        // Hold the chat so the relay's sales bot never answers OTP replies. Best effort.
        fetch(config.otp.openwaUrl.replace(/\/admin\/send$/, '/admin/otp-hold'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Relay-Signature': 'sha256=' + crypto.createHmac('sha256', config.otp.openwaSecret).update(JSON.stringify({ chat, minutes: 30 })).digest('hex') },
            body: JSON.stringify({ chat, minutes: 30 }),
            signal: AbortSignal.timeout(5_000),
        }).catch(() => {});
        return { ok: true };
    }
    const errBody = await res.text().catch(() => '');
    if (res.status === 400 && errBody.includes('unknown recipient')) return { ok: false, kind: 'not_on_whatsapp' };
    if (res.status === 401) return { ok: false, kind: 'auth' };
    return { ok: false, kind: 'send_failed', error: `${res.status} ${errBody.slice(0, 120)}` };
}

async function sendCloudApi(_phone, _text) {
    // Placeholder for the official WhatsApp Cloud API authentication template.
    // Same interface: swap OTP_SENDER=cloudapi once Meta approval lands.
    return { ok: false, kind: 'not_configured' };
}

function sender() {
    if (config.otp.sender === 'openwa') return sendOpenWA;
    if (config.otp.sender === 'cloudapi') return sendCloudApi;
    return sendDry;
}

// --- kill switch -------------------------------------------------------------

const state = {
    disabled: false,
    outcomes: [], // { ok, kind, at }
};

function recordOutcome(outcome) {
    state.outcomes.push({ ...outcome, at: Date.now() });
    if (state.outcomes.length > 50) state.outcomes.shift();
    const recent = state.outcomes.slice(-20);
    const fails = recent.filter((o) => !o.ok);
    const hardFails = fails.filter((o) => o.kind === 'send_failed' || o.kind === 'auth');
    const notOnWa = fails.filter((o) => o.kind === 'not_on_whatsapp');
    let reason = null;
    if (hardFails.length >= 5) reason = 'repeated send failures';
    else if (state.outcomes.length >= 10 && notOnWa.length / state.outcomes.length > 0.3) reason = 'not-on-WhatsApp rate above 30%';
    if (reason && !state.disabled) {
        state.disabled = true;
        logger.error({ reason }, 'OTP kill switch engaged');
        sendAlert(`LpuTV OTP login disabled automatically: ${reason}. Check the OTP sender before re-enabling.`).catch(() => {});
    }
}

export function otpStatus() {
    return { enabled: config.otp.enabled, sender: config.otp.sender, killSwitch: state.disabled, queued: pending };
}

// --- serial send queue: human-like delay, no bursts --------------------------

let queue = Promise.resolve();
let pending = 0;
let lastSentAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enqueueSend(phone, text) {
    if (pending >= 5) throw new HttpError(429, 'otp_busy', 'Too many codes being sent right now. Try again in a minute.');
    pending += 1;
    const job = queue.then(async () => {
        const gap = Date.now() - lastSentAt;
        const jitter = config.isTest ? 0 : 3000 + crypto.randomInt(0, 5000);
        const wait = Math.max(config.otp.minSendGapMs - gap, 0) + jitter;
        await sleep(wait);
        const result = await sender()(phone, text);
        lastSentAt = Date.now();
        recordOutcome(result);
        return result;
    }).finally(() => { pending -= 1; });
    queue = job.catch(() => {});
    return job;
}

// --- public API --------------------------------------------------------------

export async function requestOtp({ phone, ip }) {
    if (!config.otp.enabled) throw new HttpError(503, 'otp_disabled', 'Phone login is not available right now.');
    if (state.disabled) throw new HttpError(503, 'otp_disabled', 'Phone login is temporarily unavailable.');
    const normalized = normalizePhone(phone);
    if (!normalized) throw new HttpError(400, 'bad_phone', 'Enter a valid Indian mobile number.');

    // Real (non-dry) sends are restricted to allow-listed test numbers outside production.
    if (config.otp.sender !== 'dry' && !config.isProd && config.otp.testPhones.length && !config.otp.testPhones.includes(normalized)) {
        throw new HttpError(403, 'not_allowed', 'This number is not on the test allow-list.');
    }

    const ph = phoneHash(normalized);
    const nowMs = Date.now();
    const dayAgo = nowMs - 24 * 3600_000;
    const hourAgo = nowMs - 3600_000;

    const recentNumber = get('SELECT COUNT(*) n, MAX(created_at) last FROM otp_codes WHERE phone_hash = ? AND created_at > ?', ph, dayAgo);
    if (recentNumber.last && recentNumber.last > nowMs - config.otp.resendGapMs) throw new HttpError(429, 'otp_too_soon', 'Wait a moment before asking for another code.');
    if (recentNumber.n >= config.otp.perNumberPerDay) throw new HttpError(429, 'otp_daily_number_cap', 'Too many codes for this number today. Try again tomorrow.');

    if (ip) {
        const ipCount = get('SELECT COUNT(*) n FROM otp_codes WHERE ip = ? AND created_at > ?', ip, hourAgo)?.n || 0;
        if (ipCount >= config.otp.perIpPerHour) throw new HttpError(429, 'otp_ip_cap', 'Too many requests. Try again later.');
    }

    const globalToday = get('SELECT COUNT(*) n FROM otp_codes WHERE created_at > ?', dayAgo)?.n || 0;
    if (globalToday >= config.otp.dailyCap) {
        logger.warn({ globalToday }, 'OTP daily cap reached');
        throw new HttpError(429, 'otp_daily_cap', 'Phone login is full for today. Use Google or guest login.');
    }

    const sessionId = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const mins = Math.round(config.otp.ttlMs / 60000);
    run('INSERT INTO otp_codes (phone_hash, code_hmac, session_id, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ph, codeHmac(normalized, sessionId, code), sessionId, ip || null, nowMs + config.otp.ttlMs, nowMs);

    const text = OTP_TEXTS[crypto.randomInt(0, OTP_TEXTS.length)](code, mins);
    const result = await enqueueSend(normalized, text);
    if (!result.ok) {
        run('UPDATE otp_codes SET used = 1 WHERE session_id = ?', sessionId);
        if (result.kind === 'not_on_whatsapp') throw new HttpError(400, 'not_on_whatsapp', 'This number does not seem to be on WhatsApp.');
        logger.error({ result }, 'OTP send failed');
        throw new HttpError(502, 'otp_send_failed', 'Could not send the code right now. Try again in a minute.');
    }
    return { session: sessionId, ttlSeconds: Math.round(config.otp.ttlMs / 1000), dry: !!result.dry };
}

// Returns the verified phone number or throws.
export function verifyOtp({ phone, sessionId, code }) {
    if (!config.otp.enabled) throw new HttpError(503, 'otp_disabled', 'Phone login is not available right now.');
    const normalized = normalizePhone(phone);
    if (!normalized || !sessionId || !code) throw new HttpError(400, 'bad_request');
    const ph = phoneHash(normalized);
    const row = get('SELECT * FROM otp_codes WHERE phone_hash = ? AND session_id = ? AND used = 0 ORDER BY id DESC LIMIT 1', ph, String(sessionId));
    if (!row) throw new HttpError(401, 'bad_code', 'Wrong code. Check the message and try again.');
    if (row.expires_at < Date.now()) {
        run('UPDATE otp_codes SET used = 1 WHERE id = ?', row.id);
        throw new HttpError(410, 'otp_expired', 'That code expired. Ask for a new one.');
    }
    if (row.attempts >= config.otp.codeAttempts) {
        run('UPDATE otp_codes SET used = 1 WHERE id = ?', row.id);
        throw new HttpError(429, 'otp_too_many_attempts', 'Too many wrong tries. Ask for a new code.');
    }
    const expected = row.code_hmac;
    const given = codeHmac(normalized, String(sessionId), String(code).trim());
    const ok = expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
    if (!ok) {
        run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
        throw new HttpError(401, 'bad_code', 'Wrong code. Check the message and try again.');
    }
    run('UPDATE otp_codes SET used = 1 WHERE id = ?', row.id);
    return normalized;
}

// Retention hook for the jobs scheduler: drop codes older than 7 days.
export function purgeOldOtpCodes() {
    run('DELETE FROM otp_codes WHERE created_at < ?', Date.now() - 7 * 24 * 3600_000);
}

// Test-only access to kill-switch internals.
export const __test = { recordOutcome, state };
