// Admin metrics. Every number returns the SQL that produced it so the panel can show
// "how computed" and results can be reproduced by hand.
import { get, all } from '../db.js';
import { analyticsId } from '../util.js';

const DAY = 86_400_000;
const startOfDay = (t = Date.now()) => Date.parse(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z');

function m(sql, params, pick = 'n') {
    const row = get(sql, ...params);
    return { value: row ? row[pick] : null, sql: inline(sql, params) };
}

// Readable SQL with parameters substituted, for the tooltip only (never executed).
function inline(sql, params) {
    let i = 0;
    return sql.replace(/\?/g, () => {
        const p = params[i++];
        return typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : String(p);
    }).replace(/\s+/g, ' ').trim();
}

const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

function medianProp(event, key, from, extraSql = '', extra = []) {
    const sql = `SELECT json_extract(props, '$.${key}') AS v FROM events WHERE event = ? AND ts >= ? ${extraSql}`;
    const vals = all(sql, event, from, ...extra).map(r => r.v).filter(v => typeof v === 'number');
    return { value: median(vals), n: vals.length, sql: `median of ${inline(sql, [event, from, ...extra])}` };
}

const ACTIVE = "user_id IS NOT NULL AND user_id != 'deleted'";

export function overview(live) {
    const t = Date.now();
    const today = startOfDay(t);
    const active = (from) => m(`SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts >= ? AND ${ACTIVE}`, [from]);
    const dau = active(t - DAY);
    const newToday = m('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [new Date(today).toISOString().slice(0, 10) + ' 00:00:00']);
    const matchesToday = m("SELECT COUNT(*) / 2 AS n FROM events WHERE event = 'match_made' AND ts >= ?", [today]);
    const enjoy = m("SELECT COUNT(*) / 2 AS n FROM events WHERE event = 'enjoy_accept' AND ts >= ?", [today]);
    const unlocks = m("SELECT COUNT(*) / 2 AS n FROM events WHERE event = 'friend_accept' AND ts >= ?", [today]);
    const rate = (a, b) => (b.value ? +(a.value / b.value).toFixed(3) : null);
    return {
        dau, wau: active(t - 7 * DAY), mau: active(t - 30 * DAY),
        newToday,
        returningToday: { value: Math.max(0, (dau.value || 0) - (newToday.value || 0)), sql: 'DAU (last 24 h) minus new users today' },
        onlineNow: { value: live.onlineUsers, sql: 'live socket presence (not stored)' },
        matchesToday,
        medianWaitMs: medianProp('match_made', 'wait_ms', today),
        medianChatSec: medianProp('chat_end', 'seconds', today, "AND json_extract(props, '$.type') = 'match'"),
        enjoyRate: { value: rate(enjoy, matchesToday), sql: `(${enjoy.sql}) / matches today` },
        friendUnlockRate: { value: rate(unlocks, matchesToday), sql: `(${unlocks.sql}) / matches today` },
        trend: all("SELECT day, metric, value FROM daily_stats WHERE day >= ? AND metric IN ('dau', 'matches', 'new_users', 'reports') ORDER BY day",
            new Date(t - 30 * DAY).toISOString().slice(0, 10)),
    };
}

const FUNNEL = [
    ['Landed', "SELECT COUNT(DISTINCT COALESCE(session_id, user_id)) AS n FROM events WHERE event = 'landing_view'"],
    ['Logged in', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event IN ('guest_login', 'google_login')"],
    ['Searching', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event = 'search_start'"],
    ['Matched', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event = 'match_made'"],
    ['First message', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event = 'msg_sent' AND json_extract(props, '$.count') > 0"],
    ['Mutual enjoy', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event = 'enjoy_accept'"],
    ['Friend unlocked', "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE event = 'friend_accept'"],
];

export function funnel({ days = 7, ref = null } = {}) {
    const from = Date.now() - days * DAY;
    const filter = ref ? ' AND ts >= ? AND ref = ?' : ' AND ts >= ?';
    const params = ref ? [from, ref] : [from];
    const steps = FUNNEL.map(([label, sql]) => ({ label, ...m(sql + filter, params) }));
    const byDay = all(`SELECT date(ts / 1000, 'unixepoch') AS day,
            COUNT(DISTINCT CASE WHEN event = 'landing_view' THEN COALESCE(session_id, user_id) END) AS landed,
            COUNT(DISTINCT CASE WHEN event IN ('guest_login', 'google_login') THEN user_id END) AS logged_in,
            COUNT(DISTINCT CASE WHEN event = 'search_start' THEN user_id END) AS searching,
            COUNT(DISTINCT CASE WHEN event = 'match_made' THEN user_id END) AS matched,
            COUNT(DISTINCT CASE WHEN event = 'friend_accept' THEN user_id END) AS unlocked
        FROM events WHERE 1 = 1 ${filter} GROUP BY day ORDER BY day`, ...params);
    const byRef = all(`SELECT ref, COUNT(DISTINCT CASE WHEN event = 'landing_view' THEN COALESCE(session_id, user_id) END) AS landed,
            COUNT(DISTINCT CASE WHEN event IN ('guest_login', 'google_login') THEN user_id END) AS logged_in,
            COUNT(DISTINCT CASE WHEN event = 'match_made' THEN user_id END) AS matched
        FROM events WHERE ts >= ? AND ref IS NOT NULL GROUP BY ref ORDER BY landed DESC LIMIT 50`, from);
    return { days, ref, steps, byDay, byRef };
}

function buckets(event, key, edges, from, scale = 1) {
    const vals = all(`SELECT json_extract(props, '$.${key}') AS v FROM events WHERE event = ? AND ts >= ?`, event, from)
        .map(r => r.v).filter(v => typeof v === 'number').map(v => v / scale);
    return edges.map((lo, i) => {
        const hi = edges[i + 1];
        return { label: hi === undefined ? `${lo}s+` : `${lo}-${hi}s`, value: vals.filter(v => v >= lo && (hi === undefined || v < hi)).length };
    });
}

export function dropoff({ days = 7 } = {}) {
    const from = Date.now() - days * DAY;
    const perm = m("SELECT COUNT(*) AS n FROM events WHERE event = 'permission_denied' AND ts >= ?", [from]);
    const vreq = m("SELECT COUNT(*) AS n FROM events WHERE event = 'video_request' AND ts >= ?", [from]);
    return {
        skipBySeconds: buckets('skip', 'seconds_in_chat', [0, 10, 30, 60, 180, 600], from),
        cancelByWait: buckets('search_cancel', 'wait_ms', [0, 5, 15, 30, 60], from, 1000),
        timeouts: m("SELECT COUNT(*) AS n FROM events WHERE event = 'search_timeout' AND ts >= ?", [from]),
        permissionDenied: perm,
        permissionDeniedRate: { value: vreq.value ? +(perm.value / vreq.value).toFixed(3) : null, sql: `(${perm.sql}) / (${vreq.sql})` },
    };
}

export function quality({ days = 7 } = {}) {
    const from = Date.now() - days * DAY;
    const fail = m("SELECT COUNT(*) AS n FROM events WHERE event = 'webrtc_fail' AND ts >= ?", [from]);
    const calls = m("SELECT COUNT(*) AS n FROM events WHERE event = 'video_accept' AND ts >= ?", [from]);
    return {
        failedMatches: m("SELECT COUNT(*) AS n FROM events WHERE event = 'search_timeout' AND ts >= ?", [from]),
        webrtcFail: fail,
        webrtcFailRate: { value: calls.value ? +(fail.value / calls.value).toFixed(3) : null, sql: `(${fail.sql}) / (${calls.sql})` },
        errorsByType: all("SELECT COALESCE(json_extract(props, '$.event'), 'unknown') AS type, COUNT(*) AS n FROM events WHERE event = 'socket_error' AND ts >= ? GROUP BY type ORDER BY n DESC", from),
        permissionByKind: all("SELECT COALESCE(json_extract(props, '$.kind'), 'unknown') AS kind, COUNT(*) AS n FROM events WHERE event = 'permission_denied' AND ts >= ? GROUP BY kind", from),
        appVersions: all("SELECT COALESCE(app_version, 'unknown') AS version, COUNT(DISTINCT user_id) AS users FROM events WHERE ts >= ? GROUP BY version ORDER BY users DESC", from),
        devices: all("SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT COALESCE(session_id, user_id)) AS n FROM events WHERE ts >= ? GROUP BY device ORDER BY n DESC", from),
    };
}

// Retention cohorts by signup week (D1/D7/D30 activity of the pseudonymous id).
export function cohorts({ weeks = 8 } = {}) {
    const t = Date.now();
    const out = [];
    for (let w = weeks - 1; w >= 0; w--) {
        const start = startOfDay(t - (w + 1) * 7 * DAY);
        const end = start + 7 * DAY;
        const users = all('SELECT public_id, created_at FROM users WHERE created_at >= ? AND created_at < ?',
            new Date(start).toISOString().replace('T', ' ').slice(0, 19), new Date(end).toISOString().replace('T', ' ').slice(0, 19));
        const ret = (offset) => {
            let eligible = 0; let kept = 0;
            for (const u of users) {
                const c = Date.parse(u.created_at.replace(' ', 'T') + 'Z');
                const from = c + offset * DAY;
                if (from + DAY > t) continue;
                eligible++;
                if (get('SELECT 1 AS x FROM events WHERE user_id = ? AND ts >= ? AND ts < ? LIMIT 1', analyticsId(u.public_id), from, from + DAY)) kept++;
            }
            return eligible ? +(kept / eligible).toFixed(3) : null;
        };
        out.push({ week: new Date(start).toISOString().slice(0, 10), users: users.length, d1: ret(1), d7: ret(7), d30: ret(30) });
    }
    return { cohorts: out, sql: "users grouped by signup week; retained if any event with user_id = HMAC(public_id) on day N after signup" };
}

export function referralStats() {
    return all(`SELECT r.code, r.label, r.created_at,
            (SELECT COUNT(DISTINCT COALESCE(session_id, user_id)) FROM events e WHERE e.event = 'landing_view' AND e.ref = r.code) AS visitors,
            (SELECT COUNT(*) FROM users u WHERE u.ref = r.code) AS signups,
            (SELECT COUNT(*) FROM events e WHERE e.event = 'match_made' AND e.ref = r.code) AS matches
        FROM referrals r ORDER BY r.created_at DESC`);
}

export const EXPORTS = {
    events: { sql: 'SELECT id, ts, user_id, session_id, event, props, ref, device, app_version FROM events WHERE ts >= ? AND ts < ? ORDER BY ts', range: 'ms' },
    reports: { sql: `SELECT r.id, r.ts, ru.public_id AS reporter, du.public_id AS reported, r.reason, r.note, r.context, r.status, r.resolved_at, r.resolution_note
        FROM reports r LEFT JOIN users ru ON ru.email = r.reporter LEFT JOIN users du ON du.email = r.reported WHERE r.ts >= ? AND r.ts < ? ORDER BY r.ts`, range: 'ms' },
    daily_stats: { sql: 'SELECT day, metric, value FROM daily_stats WHERE day >= ? AND day < ? ORDER BY day, metric', range: 'day' },
    users: { sql: `SELECT public_id, name, gender, auth_provider, verified, created_at, last_seen, banned_until, ref FROM users
        WHERE created_at >= ? AND created_at < ? ORDER BY created_at`, range: 'datetime' },
    referrals: { sql: 'SELECT code, label, created_at FROM referrals WHERE created_at >= ? AND created_at < ?', range: 'ms' },
    audit_log: { sql: 'SELECT id, ts, actor, action, target, details FROM audit_log WHERE ts >= ? AND ts < ? ORDER BY ts', range: 'ms' },
};

export function exportRows(table, fromMs, toMs) {
    const spec = EXPORTS[table];
    if (!spec) return null;
    const conv = (ms) => spec.range === 'day' ? new Date(ms).toISOString().slice(0, 10)
        : spec.range === 'datetime' ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) : ms;
    return all(spec.sql, conv(fromMs), conv(toMs));
}

export function toCsv(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        // Neutralise spreadsheet formula injection.
        const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
        return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';
}
