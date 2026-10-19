// Scheduled work: session cleanup, nightly rollups, retention purge, backups, alerts.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { run, get, all, backupTo } from './db.js';
import { purgeExpiredSessions } from './sessions.js';
import { purgeNotifyLog } from './push.js';
import { flush } from './events.js';
import { logger } from './logger.js';
import { sendAlert } from './alerts.js';
import { captureError } from './errors.js';

const DAY = 86_400_000;
const timers = [];
let lastNightly = null;

export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Daily metrics so dashboards never scan raw events.
export function rollupDay(day) {
    const from = Date.parse(`${day}T00:00:00Z`);
    const to = from + DAY;
    const count = (event) => get('SELECT COUNT(*) AS n FROM events WHERE event = ? AND ts >= ? AND ts < ?', event, from, to).n;
    const users = (events) => get(`SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts >= ? AND ts < ? AND user_id IS NOT NULL AND event IN (${events.map(() => '?').join(',')})`, from, to, ...events).n;
    const props = (event, key) => all('SELECT props FROM events WHERE event = ? AND ts >= ? AND ts < ?', event, from, to)
        .map(r => { try { return JSON.parse(r.props)?.[key]; } catch { return undefined; } }).filter(v => typeof v === 'number');
    const matches = count('match_made') / 2;
    const metrics = {
        dau: users(['guest_login', 'google_login', 'resume_login', 'search_start', 'match_made', 'direct_open']),
        new_users: get('SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?', `${day} 00:00:00`, `${dayKey(to)} 00:00:00`).n,
        landing_views: count('landing_view'),
        logins: count('guest_login') + count('google_login'),
        searches: count('search_start'),
        matches,
        median_wait_ms: median(props('match_made', 'wait_ms')),
        median_chat_s: median(props('chat_end', 'seconds')),
        enjoy_mutual: count('enjoy_accept') / 2,
        friend_unlocks: count('friend_accept') / 2,
        reports: get('SELECT COUNT(*) AS n FROM reports WHERE ts >= ? AND ts < ?', from, to).n,
        search_timeouts: count('search_timeout'),
        webrtc_fail: count('webrtc_fail'),
        video_accepts: count('video_accept'),
        errors: count('socket_error'),
    };
    for (const [metric, value] of Object.entries(metrics)) {
        if (value === null || value === undefined) continue;
        run('INSERT INTO daily_stats (day, metric, value) VALUES (?, ?, ?) ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value', day, metric, value);
    }
    return metrics;
}

export function purgeRetention(t = Date.now()) {
    const r = config.retention;
    const counts = {
        events: run('DELETE FROM events WHERE ts < ?', t - r.eventsDays * DAY).changes,
        reports: run("DELETE FROM reports WHERE ts < ? AND status != 'open'", t - r.reportsDays * DAY).changes,
        sessions: purgeExpiredSessions(),
        notify: purgeNotifyLog(),
    };
    logger.info({ counts }, 'retention purge');
    return counts;
}

export function backupNow(t = Date.now()) {
    const stamp = new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(config.backupDir, `uniconnect-${stamp}.sqlite`);
    backupTo(file);
    const files = fs.readdirSync(config.backupDir).filter(f => /^uniconnect-.*\.sqlite$/.test(f)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - config.backupKeep))) fs.unlinkSync(path.join(config.backupDir, old));
    logger.info({ file: path.basename(file), kept: Math.min(files.length, config.backupKeep) }, 'backup written');
    return file;
}

export function digest(day) {
    const rows = all('SELECT metric, value FROM daily_stats WHERE day = ?', day);
    const m = Object.fromEntries(rows.map(r => [r.metric, r.value]));
    const open = get("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").n;
    return `UniConnect daily digest for ${day}: ${m.dau ?? 0} active users, ${m.new_users ?? 0} new, ${m.matches ?? 0} matches, `
        + `median wait ${m.median_wait_ms ? Math.round(m.median_wait_ms / 1000) + 's' : 'n/a'}, ${m.friend_unlocks ?? 0} friend unlocks, `
        + `${m.reports ?? 0} reports (${open} open), ${m.errors ?? 0} socket errors.`;
}

export async function nightly(t = Date.now()) {
    const yesterday = dayKey(t - DAY);
    flush();
    rollupDay(yesterday);
    purgeRetention(t);
    backupNow(t);
    await sendAlert(digest(yesterday));
}

// Spike alerts: last hour versus the trailing 24 h hourly average.
export async function spikeCheck(t = Date.now()) {
    const hour = 3_600_000;
    const checks = [
        ['error spike', "SELECT COUNT(*) AS n FROM events WHERE event = 'socket_error' AND ts >= ? AND ts < ?", 10],
        ['match-failure spike', "SELECT COUNT(*) AS n FROM events WHERE event = 'search_timeout' AND ts >= ? AND ts < ?", 10],
        ['report spike', 'SELECT COUNT(*) AS n FROM reports WHERE ts >= ? AND ts < ?', 5],
    ];
    const fired = [];
    for (const [name, sql, floor] of checks) {
        const recent = get(sql, t - hour, t).n;
        const base = get(sql, t - 25 * hour, t - hour).n / 24;
        if (recent >= floor && recent > base * 3) fired.push(`${name}: ${recent} in the last hour (usual ${base.toFixed(1)}/h)`);
    }
    if (fired.length) await sendAlert(`UniConnect alert. ${fired.join('; ')}`);
    return fired;
}

const safe = (fn, where) => async () => { try { await fn(); } catch (err) { captureError(err, { where }); } };

export function startJobs() {
    timers.push(setInterval(safe(() => purgeExpiredSessions(), 'job:sessions'), 60 * 60_000).unref());
    timers.push(setInterval(safe(() => spikeCheck(), 'job:spikes'), 15 * 60_000).unref());
    // Nightly at the first check after 00:30 UTC (06:00 IST).
    timers.push(setInterval(safe(async () => {
        const t = Date.now();
        const d = new Date(t);
        const today = dayKey(t);
        if (lastNightly !== today && (d.getUTCHours() > 0 || d.getUTCMinutes() >= 30)) {
            lastNightly = today;
            await nightly(t);
        }
    }, 'job:nightly'), 10 * 60_000).unref());
}

export function stopJobs() {
    timers.splice(0).forEach(clearInterval);
}
