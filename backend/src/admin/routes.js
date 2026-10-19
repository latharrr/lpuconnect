import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { run, get, all } from '../db.js';
import { createSession, validateSession, bearer, revokeSession } from '../sessions.js';
import { getUser, setBan, exportUser, deleteUser, invalidateUser } from '../users.js';
import { allSettings, setSetting, audit } from '../settings.js';
import { liveStats, kickUser } from '../realtime/index.js';
import { recentErrors, HttpError } from '../errors.js';
import { eventStats, bufferedCount, flush } from '../events.js';
import { lagMs } from '../health.js';
import { sendAlert } from '../alerts.js';
import { digest, dayKey, rollupDay } from '../jobs.js';
import { analyticsId, clampText, randomHandle } from '../util.js';
import * as M from './metrics.js';

const google = new OAuth2Client();
const ADMIN_TTL = 8 * 3_600_000;
const DAY = 86_400_000;

export const adminRouter = Router();

// Only allow-listed Google accounts (2FA enforced on the Google side), or a dev token outside production.
adminRouter.post('/login', async (req, res) => {
    const { idToken, devToken } = req.body || {};
    if (devToken && config.adminDevToken && devToken === config.adminDevToken) {
        audit('dev-admin', 'admin_login', null, null);
        return res.json({ token: createSession('dev-admin', 'admin', ADMIN_TTL), email: 'dev-admin' });
    }
    if (!config.googleClientId) throw new HttpError(501, 'google_not_configured');
    let payload;
    try {
        payload = (await google.verifyIdToken({ idToken, audience: config.googleClientId })).getPayload();
    } catch {
        throw new HttpError(401, 'bad_google_token');
    }
    const email = payload?.email?.toLowerCase();
    if (!email || !payload.email_verified || !config.adminEmails.includes(email)) {
        audit(email || 'unknown', 'admin_login_denied', null, null);
        throw new HttpError(403, 'not_an_admin');
    }
    audit(email, 'admin_login', null, null);
    res.json({ token: createSession(email, 'admin', ADMIN_TTL), email });
});

function requireAdmin(req, _res, next) {
    const email = validateSession(bearer(req), 'admin');
    const allowed = email && (config.adminEmails.includes(email) || (email === 'dev-admin' && config.adminDevToken));
    if (!allowed) return next(new HttpError(403, 'forbidden'));
    req.admin = email;
    next();
}

adminRouter.use((req, res, next) => (req.path === '/login' ? next() : requireAdmin(req, res, next)));

adminRouter.post('/logout', (req, res) => { revokeSession(bearer(req)); res.json({ ok: true }); });

const days = (req) => Math.min(Math.max(Number.parseInt(req.query.days, 10) || 7, 1), 365);

adminRouter.get('/overview', (req, res) => { flush(); res.json(M.overview(liveStats())); });
adminRouter.get('/funnel', (req, res) => { flush(); res.json(M.funnel({ days: days(req), ref: req.query.ref ? String(req.query.ref) : null })); });
adminRouter.get('/dropoff', (req, res) => res.json(M.dropoff({ days: days(req) })));
adminRouter.get('/quality', (req, res) => res.json(M.quality({ days: days(req) })));
adminRouter.get('/cohorts', (req, res) => res.json(M.cohorts({ weeks: Math.min(Number(req.query.weeks) || 8, 26) })));

adminRouter.get('/live', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
        ...liveStats(),
        memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576), limit: config.maxMemoryMb },
        eventLoopLagMs: lagMs(),
        uptimeSec: Math.round(process.uptime()),
        events: { buffered: bufferedCount(), ...eventStats },
        errors: recentErrors(),
        release: config.release,
    });
});

// ---- Moderation ----
const REPORT_COLS = `r.id, r.ts, r.reason, r.note, r.context, r.status, r.resolved_by, r.resolved_at, r.resolution_note,
    ru.public_id AS reporter_id, ru.name AS reporter_name, du.public_id AS reported_id, du.name AS reported_name, du.banned_until AS reported_banned_until,
    (SELECT COUNT(*) FROM reports x WHERE x.reported = r.reported) AS reported_total`;

adminRouter.get('/reports', (req, res) => {
    const status = ['open', 'resolved', 'dismissed', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const rows = all(`SELECT ${REPORT_COLS} FROM reports r LEFT JOIN users ru ON ru.email = r.reporter LEFT JOIN users du ON du.email = r.reported
        ${status === 'all' ? '' : 'WHERE r.status = ?'} ORDER BY r.ts DESC LIMIT 200`, ...(status === 'all' ? [] : [status]));
    res.json({ reports: rows.map(r => ({ ...r, context: r.context ? JSON.parse(r.context) : null })) });
});

adminRouter.post('/reports/:id/resolve', (req, res) => {
    const id = Number(req.params.id);
    const { status = 'resolved', note = '', action = 'none', hours = 24 } = req.body || {};
    if (!['resolved', 'dismissed'].includes(status)) throw new HttpError(400, 'bad_status');
    const report = get('SELECT * FROM reports WHERE id = ?', id);
    if (!report) throw new HttpError(404, 'not_found');
    run('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE id = ?', status, req.admin, Date.now(), clampText(note, 500), id);
    const target = getUser(report.reported);
    if (target && action !== 'none') applyBanAction(target, action, hours, `report #${id}`, req.admin);
    audit(req.admin, `report_${status}`, `report:${id}`, { action, hours: action === 'timeout' ? hours : undefined, note: clampText(note, 200) });
    res.json({ ok: true });
});

function applyBanAction(user, action, hours, reason, actor) {
    if (action === 'timeout') setBan(user.email, Date.now() + Math.min(Number(hours) || 24, 24 * 90) * 3_600_000, reason);
    else if (action === 'ban') setBan(user.email, Date.now() + 10 * 365 * DAY, reason);
    else if (action === 'unban') setBan(user.email, null, null);
    else throw new HttpError(400, 'bad_action');
    if (action !== 'unban') kickUser(user.email, 'suspended');
    audit(actor, `user_${action}`, user.public_id, { hours: action === 'timeout' ? hours : undefined, reason });
}

adminRouter.post('/users/:id/moderate', (req, res) => {
    const user = get('SELECT * FROM users WHERE public_id = ?', req.params.id);
    if (!user) throw new HttpError(404, 'not_found');
    const { action, hours, reason } = req.body || {};
    applyBanAction(user, action, hours, clampText(reason || 'admin action', 200), req.admin);
    invalidateUser(user.email);
    res.json({ ok: true });
});

adminRouter.get('/audit', (_req, res) => {
    res.json({ entries: all('SELECT id, ts, actor, action, target, details FROM audit_log ORDER BY id DESC LIMIT 300') });
});

// ---- Users ----
adminRouter.get('/users', (req, res) => {
    const q = clampText(String(req.query.q || ''), 60);
    const rows = q
        ? all(`SELECT public_id, name, gender, auth_provider, verified, created_at, last_seen, banned_until FROM users
               WHERE public_id LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 100`, `${q}%`, `%${q}%`)
        : all('SELECT public_id, name, gender, auth_provider, verified, created_at, last_seen, banned_until FROM users ORDER BY created_at DESC LIMIT 100');
    res.json({ users: rows, total: get('SELECT COUNT(*) AS n FROM users').n });
});

adminRouter.get('/users/:id', (req, res) => {
    const u = get('SELECT * FROM users WHERE public_id = ?', req.params.id);
    if (!u) throw new HttpError(404, 'not_found');
    const aid = analyticsId(u.public_id);
    res.json({
        user: {
            id: u.public_id, name: u.name, gender: u.gender, provider: u.auth_provider, verified: !!u.verified,
            createdAt: u.created_at, lastSeen: u.last_seen, bannedUntil: u.banned_until, banReason: u.ban_reason, ref: u.ref, consentAt: u.consent_at,
        },
        counts: {
            friends: get('SELECT COUNT(*) AS n FROM friends WHERE user_id_1 = ?', u.email).n,
            reportsAgainst: get('SELECT COUNT(*) AS n FROM reports WHERE reported = ?', u.email).n,
            reportsFiled: get('SELECT COUNT(*) AS n FROM reports WHERE reporter = ?', u.email).n,
            blockedBy: get('SELECT COUNT(*) AS n FROM blocks WHERE blocked = ?', u.email).n,
            matches: get("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND event = 'match_made'", aid).n,
            events: get('SELECT COUNT(*) AS n FROM events WHERE user_id = ?', aid).n,
        },
    });
});

adminRouter.get('/users/:id/export', (req, res) => {
    const u = get('SELECT email, public_id FROM users WHERE public_id = ?', req.params.id);
    if (!u) throw new HttpError(404, 'not_found');
    audit(req.admin, 'user_export', u.public_id, null);
    res.set('Content-Disposition', `attachment; filename="user-${u.public_id}.json"`);
    res.json(exportUser(u.email));
});

adminRouter.delete('/users/:id', (req, res) => {
    const u = get('SELECT email, public_id FROM users WHERE public_id = ?', req.params.id);
    if (!u) throw new HttpError(404, 'not_found');
    kickUser(u.email, 'account_deleted');
    deleteUser(u.email, analyticsId(u.public_id));
    audit(req.admin, 'user_delete', u.public_id, null);
    res.json({ ok: true });
});

// ---- Growth ----
adminRouter.get('/referrals', (_req, res) => res.json({ referrals: M.referralStats(), appUrl: process.env.PUBLIC_APP_URL || null }));

adminRouter.post('/referrals', (req, res) => {
    const label = clampText(req.body?.label || '', 60);
    const code = clampText(req.body?.code || '', 30).replace(/[^\w-]/g, '') || randomHandle(6).toLowerCase();
    if (get('SELECT 1 AS x FROM referrals WHERE code = ?', code)) throw new HttpError(409, 'code_taken');
    run('INSERT INTO referrals (code, label, created_at, created_by) VALUES (?, ?, ?, ?)', code, label || null, Date.now(), req.admin);
    audit(req.admin, 'referral_create', code, { label });
    res.json({ code });
});

// ---- Export ----
adminRouter.get('/export/:table', (req, res) => {
    const table = req.params.table.replace(/\.csv$/, '');
    const to = req.query.to ? Date.parse(req.query.to) + DAY : Date.now() + DAY;
    const from = req.query.from ? Date.parse(req.query.from) : to - 31 * DAY;
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new HttpError(400, 'bad_range');
    const rows = M.exportRows(table, from, to);
    if (!rows) throw new HttpError(404, 'unknown_table');
    audit(req.admin, 'export', table, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows: rows.length });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${table}-${dayKey(from)}-${dayKey(to - DAY)}.csv"`);
    res.send(M.toCsv(rows));
});

// ---- Settings, alerts ----
adminRouter.get('/settings', (_req, res) => res.json({ settings: allSettings() }));

adminRouter.post('/settings', (req, res) => {
    for (const [k, v] of Object.entries(req.body || {})) {
        try { setSetting(k, v, req.admin); } catch (err) { throw new HttpError(400, err.message); }
        audit(req.admin, 'setting_change', k, { value: v });
    }
    res.json({ settings: allSettings() });
});

adminRouter.get('/digest', (_req, res) => {
    const day = dayKey(Date.now() - DAY);
    rollupDay(day);
    res.json({ day, text: digest(day), webhook: !!config.alertWebhookUrl });
});

adminRouter.post('/alerts/test', async (req, res) => {
    const ok = await sendAlert(`Test alert from the UniConnect admin panel (${req.admin}).`);
    audit(req.admin, 'alert_test', null, { delivered: ok });
    res.json({ delivered: ok, configured: !!config.alertWebhookUrl });
});
