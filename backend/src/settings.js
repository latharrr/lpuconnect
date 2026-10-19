import { get, run, all } from './db.js';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

// Defaults come from env; admins can override at runtime (stored in `settings`).
export const SETTING_DEFAULTS = {
    autoban_reports: () => config.autoBan.reports,
    autoban_window_hours: () => config.autoBan.windowHours,
    autoban_hours: () => config.autoBan.banHours,
};

export function getSetting(key) {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    if (row) return Number(row.value);
    return SETTING_DEFAULTS[key]?.();
}

export function setSetting(key, value, actor) {
    if (!(key in SETTING_DEFAULTS)) throw new Error('unknown_setting');
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) throw new Error('bad_value');
    run(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        key, String(n), Date.now(), actor);
}

export function allSettings() {
    const stored = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, Number(r.value)]));
    return Object.fromEntries(Object.keys(SETTING_DEFAULTS).map(k => [k, stored[k] ?? SETTING_DEFAULTS[k]()]));
}

export function audit(actor, action, target, details) {
    run('INSERT INTO audit_log (ts, actor, action, target, details) VALUES (?, ?, ?, ?, ?)',
        Date.now(), actor, action, target || null, details ? JSON.stringify(details) : null);
}

// Secrets that may be provided by env; otherwise generated once and kept in the database so
// a zero-config deploy (e.g. Render without env vars) still starts with stable values.
export function provisionSecret(name, current) {
    if (current) return current;
    const key = `secret:${name}`;
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    if (row) return row.value;
    const value = randomBytes(32).toString('hex');
    run('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)', key, value, Date.now(), 'system');
    return value;
}
