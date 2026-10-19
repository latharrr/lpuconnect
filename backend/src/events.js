// Append-only analytics. Writes go to an in-memory buffer that is flushed in one
// transaction every 10 s or 200 rows. Message text is never accepted here.
import { run, tx } from './db.js';
import { getUser } from './users.js';
import { analyticsId, now } from './util.js';
import { logger } from './logger.js';

export const EVENTS = new Set([
    'landing_view', 'ref_captured', 'install_prompt', 'guest_login', 'google_login', 'resume_login',
    'onboarding_step', 'onboarding_skip', 'consent_given',
    'search_start', 'search_cancel', 'match_made', 'search_timeout',
    'msg_sent', 'skip', 'enjoy_request', 'enjoy_accept', 'extend_request', 'extend_accept',
    'video_request', 'video_accept', 'video_end', 'chat_end', 'icebreaker_used',
    'friend_request', 'friend_accept', 'direct_open', 'direct_msg_count', 'invite_shared',
    'report_submit', 'block', 'auto_flag', 'auto_ban',
    'socket_error', 'webrtc_fail', 'permission_denied', 'reconnect', 'feedback',
    'push_subscribe', 'push_sent', 'account_delete', 'data_export', 'audio_only',
]);

// Events a browser may send directly (everything else is recorded by the server).
export const CLIENT_EVENTS = new Set([
    'landing_view', 'ref_captured', 'install_prompt', 'onboarding_step', 'onboarding_skip',
    'webrtc_fail', 'permission_denied', 'feedback', 'icebreaker_used', 'invite_shared', 'audio_only',
]);

const FORBIDDEN_PROPS = new Set(['text', 'message', 'msg', 'email', 'name', 'note', 'bio']);
const MAX_BUFFER = 200;
const FLUSH_MS = 10_000;
const HARD_CAP = 5_000;

let buffer = [];
let timer = null;
export const eventStats = { written: 0, dropped: 0, flushes: 0 };

function cleanProps(props) {
    if (!props || typeof props !== 'object') return null;
    const out = {};
    for (const [k, v] of Object.entries(props).slice(0, 20)) {
        if (FORBIDDEN_PROPS.has(k)) continue;
        if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        else if (typeof v === 'string') out[k] = v.slice(0, 64);
    }
    return Object.keys(out).length ? JSON.stringify(out) : null;
}

export function track(event, { email, userId, sessionId, props, ref, device, appVersion } = {}) {
    if (!EVENTS.has(event)) return;
    if (buffer.length >= HARD_CAP) { eventStats.dropped++; return; }
    const user = email ? getUser(email) : null;
    const uid = userId || (user ? analyticsId(user.public_id) : null);
    const r = ref || user?.ref || null;
    buffer.push([now(), uid, sessionId || null, event, cleanProps(props), r ? String(r).slice(0, 40) : null,
        device ? String(device).slice(0, 40) : null, appVersion ? String(appVersion).slice(0, 20) : null]);
    if (buffer.length >= MAX_BUFFER) flush();
}

export function flush() {
    if (!buffer.length) return 0;
    const rows = buffer;
    buffer = [];
    try {
        tx(() => {
            for (const r of rows) {
                run('INSERT INTO events (ts, user_id, session_id, event, props, ref, device, app_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...r);
            }
        });
        eventStats.written += rows.length;
        eventStats.flushes++;
    } catch (err) {
        logger.error({ err }, 'event flush failed');
        eventStats.dropped += rows.length;
    }
    return rows.length;
}

export function startEventFlusher() {
    if (!timer) timer = setInterval(flush, FLUSH_MS).unref();
}

export function stopEventFlusher() {
    if (timer) clearInterval(timer);
    timer = null;
    return flush();
}

export const bufferedCount = () => buffer.length;
