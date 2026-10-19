// Web push (opt-in). Quiet hours and per-subject rate caps keep it from nagging.
import webpush from 'web-push';
import { config } from './config.js';
import { all, run, get } from './db.js';
import { track } from './events.js';
import { logger } from './logger.js';

const enabled = !!(config.vapidPublic && config.vapidPrivate && config.vapidSubject);
if (enabled) webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);

// Quiet hours in India time by default: no pushes between 23:00 and 08:00.
const [QUIET_FROM, QUIET_TO] = (process.env.QUIET_HOURS || '23-8').split('-').map(Number);
const TZ_OFFSET_MIN = Number(process.env.QUIET_TZ_OFFSET_MIN ?? 330);

export function inQuietHours(t = Date.now()) {
    const h = new Date(t + TZ_OFFSET_MIN * 60_000).getUTCHours();
    return QUIET_FROM > QUIET_TO ? (h >= QUIET_FROM || h < QUIET_TO) : (h >= QUIET_FROM && h < QUIET_TO);
}

export const pushEnabled = () => enabled;

export async function notify(email, { kind, subject, capMs, title, body, url }) {
    if (!enabled || inQuietHours()) return false;
    const t = Date.now();
    if (get('SELECT 1 FROM notify_log WHERE email = ? AND kind = ? AND subject = ? AND ts > ?', email, kind, subject, t - capMs)) return false;
    const subs = all('SELECT endpoint, keys FROM push_subscriptions WHERE email = ?', email);
    if (!subs.length) return false;
    run('INSERT INTO notify_log (email, kind, subject, ts) VALUES (?, ?, ?, ?)', email, kind, subject, t);
    const payload = JSON.stringify({ title, body, url: url || '/', tag: `${kind}:${subject}` });
    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload, { TTL: 600 });
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint);
            else logger.warn({ status: err.statusCode }, 'push failed');
        }
    }));
    track('push_sent', { email, props: { kind } });
    return true;
}

export function purgeNotifyLog() {
    return run('DELETE FROM notify_log WHERE ts < ?', Date.now() - 7 * 86_400_000).changes;
}
