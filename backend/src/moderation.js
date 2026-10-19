// Reports, blocks and the auto-ban rule.
import { run, get } from './db.js';
import { block, setBan, getUser } from './users.js';
import { getSetting, audit } from './settings.js';
import { track } from './events.js';
import { clampText } from './util.js';

export const REPORT_REASONS = ['Harassment', 'Inappropriate content', 'Spam', 'Underage', 'Other'];

// Files a report and auto-blocks the pair. Returns { banned } when the rule fired.
export function fileReport({ reporter, reported, reason, note, context }) {
    if (!REPORT_REASONS.includes(reason)) throw new Error('bad_reason');
    const t = Date.now();
    run('INSERT INTO reports (ts, reporter, reported, reason, note, context) VALUES (?, ?, ?, ?, ?, ?)',
        t, reporter, reported, reason, clampText(note || '', 500) || null, context ? JSON.stringify(context) : null);
    block(reporter, reported);
    track('report_submit', { email: reporter, props: { reason } });
    return applyAutoBan(reported, t);
}

// S3: N distinct reporters within the window puts the account on a temporary suspension pending review.
export function applyAutoBan(reported, t = Date.now()) {
    const threshold = getSetting('autoban_reports');
    if (!threshold) return { banned: false };
    const windowMs = getSetting('autoban_window_hours') * 3_600_000;
    const n = get('SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE reported = ? AND ts > ?', reported, t - windowMs).n;
    const user = getUser(reported);
    if (n < threshold || !user) return { banned: false };
    if (user.banned_until && Date.parse(user.banned_until) > t) return { banned: false };
    const until = t + getSetting('autoban_hours') * 3_600_000;
    setBan(reported, until, `auto: ${n} reports`);
    audit('system', 'auto_ban', user.public_id, { reports: n, until: new Date(until).toISOString() });
    track('auto_ban', { email: reported, props: { reports: n } });
    return { banned: true, until };
}

export function blockPair(blocker, blocked) {
    block(blocker, blocked);
    track('block', { email: blocker, props: { from: 'chat' } });
}
