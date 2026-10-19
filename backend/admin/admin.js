// UniConnect admin panel. Vanilla JS, served by the API process at /admin.
// Every user-supplied string goes through esc() before it touches innerHTML.
const API = '/admin/api';
const KEY = 'uc_admin_token';
let token = sessionStorage.getItem(KEY);

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTs = (ms) => (ms ? new Date(ms).toLocaleString() : '');
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v === null || v === undefined ? 'n/a' : Number(v).toLocaleString());
const secs = (ms) => (ms === null || ms === undefined ? 'n/a' : `${Math.round(ms / 1000)} s`);

async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 403 && path !== '/login') { logout(); throw new Error('Session expired'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
}

async function download(path, filename) {
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert(`Export failed (${res.status})`); return; }
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- shared renderers ----------
const sql = (s) => (s ? `<details class="sql"><summary>How computed</summary><code>${esc(s)}</code></details>` : '');
const kpi = (label, metric, f = num) => `<div class="kpi"><span>${esc(label)}</span><b>${esc(f(metric?.value))}</b>${sql(metric?.sql)}</div>`;

function bars(rows, { label = 'label', value = 'value', fmt = num } = {}) {
    const max = Math.max(1, ...rows.map(r => r[value] || 0));
    return `<div class="chart">${rows.map(r => `
        <div class="chart-row"><span>${esc(r[label])}</span>
        <div class="chart-bar"><i style="width:${((r[value] || 0) / max) * 100}%"></i></div>
        <span class="tabular" style="text-align:right">${esc(fmt(r[value]))}</span></div>`).join('')}</div>`;
}

function spark(points) {
    if (!points.length) return '<p class="muted">No daily data yet. Rollups run nightly.</p>';
    const w = 600; const h = 110; const max = Math.max(1, ...points.map(p => p.value));
    const bw = w / points.length;
    return `<svg class="spark" viewBox="0 0 ${w} ${h + 12}" preserveAspectRatio="none" role="img" aria-label="Daily trend">
        ${points.map((p, i) => `<rect x="${i * bw + 1}" y="${h - (p.value / max) * h}" width="${Math.max(1, bw - 2)}" height="${(p.value / max) * h}"><title>${esc(p.day)}: ${esc(p.value)}</title></rect>`).join('')}
        <text x="0" y="${h + 11}">${esc(points[0].day)}</text><text x="${w}" y="${h + 11}" text-anchor="end">${esc(points[points.length - 1].day)}</text></svg>`;
}

function table(cols, rows, empty = 'Nothing here yet.') {
    if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
    return `<table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.get ? c.get(r) : r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const daysPicker = (cur) => `<label>Range <select id="days">${[1, 7, 30, 90].map(d => `<option value="${d}" ${d === cur ? 'selected' : ''}>${d === 1 ? 'Last 24 h' : `Last ${d} days`}</option>`).join('')}</select></label>`;

// ---------- pages ----------
const PAGES = {
    async Overview() {
        const o = await call('/overview');
        const trend = (m) => o.trend.filter(r => r.metric === m).map(r => ({ day: r.day, value: r.value }));
        return `<h2>Overview</h2>
        <div class="kpis">
            ${kpi('Daily active', o.dau)}${kpi('Weekly active', o.wau)}${kpi('Monthly active', o.mau)}
            ${kpi('New today', o.newToday)}${kpi('Returning today', o.returningToday)}${kpi('Online now', o.onlineNow)}
            ${kpi('Matches today', o.matchesToday)}${kpi('Median wait to match', o.medianWaitMs, secs)}
            ${kpi('Median chat length', o.medianChatSec, v => (v === null ? 'n/a' : `${Math.round(v)} s`))}
            ${kpi('Enjoy rate', o.enjoyRate, pct)}${kpi('Friend unlock rate', o.friendUnlockRate, pct)}
        </div>
        <div class="grid2">
            <div class="card"><h3>Daily active users (30 days)</h3>${spark(trend('dau'))}</div>
            <div class="card"><h3>Matches per day (30 days)</h3>${spark(trend('matches'))}</div>
        </div>`;
    },

    async Funnel(state) {
        const days = state.days || 7;
        const f = await call(`/funnel?days=${days}${state.ref ? `&ref=${encodeURIComponent(state.ref)}` : ''}`);
        const top = f.steps[0]?.value || 0;
        return `<h2>Funnel</h2>
        <div class="bar">${daysPicker(days)}<label>Referral <input id="ref" value="${esc(state.ref || '')}" placeholder="all"></label><button class="btn" id="apply">Apply</button></div>
        <div class="card">${table([
            { label: 'Step', key: 'label' },
            { label: 'Users', num: true, get: r => num(r.value) },
            { label: 'Of landed', num: true, get: r => (top ? pct(r.value / top) : 'n/a') },
            { label: 'SQL', html: r => sql(r.sql) },
        ], f.steps)}</div>
        <div class="grid2">
            <div class="card"><h3>Per day</h3>${table([{ label: 'Day', key: 'day' }, { label: 'Landed', key: 'landed', num: true }, { label: 'Logged in', key: 'logged_in', num: true }, { label: 'Searching', key: 'searching', num: true }, { label: 'Matched', key: 'matched', num: true }, { label: 'Unlocked', key: 'unlocked', num: true }], f.byDay)}</div>
            <div class="card"><h3>Per referral</h3>${table([{ label: 'Ref', key: 'ref' }, { label: 'Landed', key: 'landed', num: true }, { label: 'Logged in', key: 'logged_in', num: true }, { label: 'Matched', key: 'matched', num: true }], f.byRef, 'No referral traffic yet.')}</div>
        </div>`;
    },

    async 'Drop-off'(state) {
        const days = state.days || 7;
        const d = await call(`/dropoff?days=${days}`);
        return `<h2>Drop-off</h2><div class="bar">${daysPicker(days)}</div>
        <div class="kpis">${kpi('Search timeouts', d.timeouts)}${kpi('Permission denied', d.permissionDenied)}${kpi('Permission denied rate', d.permissionDeniedRate, pct)}</div>
        <div class="grid2">
            <div class="card"><h3>Skips by seconds into chat</h3>${bars(d.skipBySeconds)}</div>
            <div class="card"><h3>Search cancels by wait</h3>${bars(d.cancelByWait)}</div>
        </div>`;
    },

    async Live() {
        const l = await call('/live');
        return `<h2>Live</h2><div class="bar"><button class="btn" id="refresh">Refresh</button><span class="muted">Release ${esc(l.release)} · up ${Math.round(l.uptimeSec / 60)} min</span></div>
        <div class="kpis">
            ${kpi('Online users', { value: l.onlineUsers })}${kpi('Sockets', { value: l.sockets })}${kpi('Queue', { value: l.queue })}
            ${kpi('Active rooms', { value: l.rooms })}${kpi('RSS memory (MB)', { value: l.memoryMb.rss })}${kpi('Heap (MB)', { value: l.memoryMb.heapUsed })}
            ${kpi('Event loop lag p99 (ms)', { value: l.eventLoopLagMs })}${kpi('Events buffered', { value: l.events.buffered })}${kpi('Events dropped', { value: l.events.dropped })}
        </div>
        <div class="card"><h3>Last errors</h3>${table([{ label: 'Time', get: r => fmtTs(r.ts) }, { label: 'Type', key: 'type' }, { label: 'Where', key: 'where' }, { label: 'Message', key: 'message' }], l.errors, 'No errors since start.')}</div>`;
    },

    async Moderation(state) {
        const status = state.status || 'open';
        const [r, s, a] = await Promise.all([call(`/reports?status=${status}`), call('/settings'), call('/audit')]);
        const reportCols = [
            { label: 'Time', get: x => fmtTs(x.ts) },
            { label: 'Reported', html: x => `${esc(x.reported_name || x.reported_id)} <span class="muted">(${esc(x.reported_total)} total)</span>${x.reported_banned_until && Date.parse(x.reported_banned_until) > Date.now() ? ' <span class="tag ban">suspended</span>' : ''}` },
            { label: 'Reason', key: 'reason' },
            { label: 'Note', key: 'note' },
            { label: 'Context', get: x => (x.context ? `${x.context.type}, ${x.context.seconds}s${x.context.video ? ', video' : ''}${x.context.flagged ? `, ${x.context.flagged} flagged` : ''}` : '') },
            { label: 'Status', html: x => `<span class="tag ${x.status === 'open' ? 'open' : 'ok'}">${esc(x.status)}</span>` },
            {
                label: 'Action', html: x => (x.status !== 'open' ? esc(x.resolution_note || '') : `
                <div class="bar">
                    <select data-act="${x.id}"><option value="none">No action</option><option value="timeout">Suspend 24 h</option><option value="ban">Ban</option><option value="unban">Lift suspension</option></select>
                    <button class="btn primary" data-resolve="${x.id}">Resolve</button><button class="btn ghost" data-dismiss="${x.id}">Dismiss</button>
                </div>`),
            },
        ];
        return `<h2>Moderation</h2>
        <div class="bar"><label>Status <select id="status">${['open', 'resolved', 'dismissed', 'all'].map(v => `<option ${v === status ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <div class="card">${table(reportCols, r.reports, 'No reports in this state.')}</div>
        <div class="grid2">
            <div class="card"><h3>Auto-suspension rule</h3>
                <p class="muted">Suspend an account when this many different people report it within the window.</p>
                <form id="rules" class="bar">
                    <label>Reports <input type="number" min="0" name="autoban_reports" value="${esc(s.settings.autoban_reports)}" style="width:80px"></label>
                    <label>Window (h) <input type="number" min="1" name="autoban_window_hours" value="${esc(s.settings.autoban_window_hours)}" style="width:80px"></label>
                    <label>Suspend for (h) <input type="number" min="1" name="autoban_hours" value="${esc(s.settings.autoban_hours)}" style="width:80px"></label>
                    <button class="btn primary">Save</button>
                </form></div>
            <div class="card"><h3>Audit log</h3>${table([{ label: 'Time', get: x => fmtTs(x.ts) }, { label: 'Actor', key: 'actor' }, { label: 'Action', key: 'action' }, { label: 'Target', key: 'target' }], a.entries.slice(0, 50))}</div>
        </div>`;
    },

    async Users(state) {
        const r = await call(`/users${state.q ? `?q=${encodeURIComponent(state.q)}` : ''}`);
        let detail = '';
        if (state.user) {
            const d = await call(`/users/${encodeURIComponent(state.user)}`);
            const u = d.user;
            const banned = u.bannedUntil && Date.parse(u.bannedUntil) > Date.now();
            detail = `<div class="card"><h3>${esc(u.name)} <span class="muted">${esc(u.id)}</span> ${banned ? '<span class="tag ban">suspended</span>' : ''} ${u.verified ? '<span class="tag ok">verified</span>' : ''}</h3>
                <p class="muted">${esc(u.provider)} · ${esc(u.gender)} · joined ${esc(u.createdAt)} · last seen ${esc(u.lastSeen || 'n/a')} · ref ${esc(u.ref || 'none')} · consent ${esc(u.consentAt || 'n/a')}</p>
                ${banned ? `<p>Suspended until ${esc(u.bannedUntil)} (${esc(u.banReason || '')})</p>` : ''}
                <div class="kpis">${Object.entries(d.counts).map(([k, v]) => kpi(k.replace(/([A-Z])/g, ' $1'), { value: v })).join('')}</div>
                <div class="bar">
                    <button class="btn" data-mod="timeout">Suspend 24 h</button><button class="btn" data-mod="ban">Ban</button>
                    ${banned ? '<button class="btn" data-mod="unban">Lift suspension</button>' : ''}
                    <button class="btn" id="uexport">Export data</button><button class="btn danger" id="udelete">Delete account</button>
                </div></div>`;
        }
        return `<h2>Users <span class="muted">${esc(r.total)} total</span></h2>
            <form id="usearch" class="bar"><input name="q" placeholder="Name or id" value="${esc(state.q || '')}"><button class="btn">Search</button></form>
            ${detail}
            <div class="card">${table([
                { label: 'Name', html: u => `<a href="#" data-user="${esc(u.public_id)}">${esc(u.name)}</a>` },
                { label: 'Id', key: 'public_id' }, { label: 'Provider', key: 'auth_provider' },
                { label: 'Joined', key: 'created_at' }, { label: 'Last seen', key: 'last_seen' },
                { label: 'Status', html: u => (u.banned_until && Date.parse(u.banned_until) > Date.now() ? '<span class="tag ban">suspended</span>' : '') },
            ], r.users)}</div>`;
    },

    async Growth() {
        const [r, c] = await Promise.all([call('/referrals'), call('/cohorts')]);
        const base = r.appUrl || location.origin.replace(/:\d+$/, '');
        return `<h2>Growth</h2>
        <div class="card"><h3>Referral links</h3>
            <form id="newref" class="bar"><input name="label" placeholder="Label, e.g. Hostel B poster"><input name="code" placeholder="Code (optional)"><button class="btn primary">Create link</button></form>
            ${table([{ label: 'Code', key: 'code' }, { label: 'Label', key: 'label' }, { label: 'Link', get: x => `${base}/?ref=${x.code}` },
                { label: 'Visitors', key: 'visitors', num: true }, { label: 'Signups', key: 'signups', num: true }, { label: 'Matches', key: 'matches', num: true }], r.referrals, 'No referral links yet.')}
        </div>
        <div class="card"><h3>Retention by signup week</h3>${sql(c.sql)}
            ${table([{ label: 'Week of', key: 'week' }, { label: 'Signups', key: 'users', num: true }, { label: 'D1', num: true, get: x => pct(x.d1) }, { label: 'D7', num: true, get: x => pct(x.d7) }, { label: 'D30', num: true, get: x => pct(x.d30) }], c.cohorts)}
        </div>`;
    },

    async Quality(state) {
        const days = state.days || 7;
        const q = await call(`/quality?days=${days}`);
        return `<h2>Quality</h2><div class="bar">${daysPicker(days)}</div>
        <div class="kpis">${kpi('Failed matches (timeouts)', q.failedMatches)}${kpi('WebRTC failures', q.webrtcFail)}${kpi('WebRTC failure rate', q.webrtcFailRate, pct)}</div>
        <div class="grid2">
            <div class="card"><h3>Socket errors by event</h3>${bars(q.errorsByType, { label: 'type', value: 'n' })}</div>
            <div class="card"><h3>Permission denied by kind</h3>${bars(q.permissionByKind, { label: 'kind', value: 'n' })}</div>
            <div class="card"><h3>App versions</h3>${bars(q.appVersions, { label: 'version', value: 'users' })}</div>
            <div class="card"><h3>Devices</h3>${bars(q.devices, { label: 'device', value: 'n' })}</div>
        </div>`;
    },

    async Export() {
        const today = new Date().toISOString().slice(0, 10);
        const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        return `<h2>Export</h2>
        <form id="export" class="card bar">
            <label>Table <select name="table">${['events', 'reports', 'daily_stats', 'users', 'referrals', 'audit_log'].map(t => `<option>${t}</option>`).join('')}</select></label>
            <label>From <input type="date" name="from" value="${monthAgo}"></label>
            <label>To <input type="date" name="to" value="${today}"></label>
            <button class="btn primary">Download CSV</button>
        </form>
        <p class="muted">Exports never include emails or message text. Every export is written to the audit log.</p>`;
    },

    async Alerts() {
        const d = await call('/digest');
        return `<h2>Alerts</h2>
        <div class="card"><h3>Daily digest preview (${esc(d.day)})</h3><p>${esc(d.text)}</p>
            <p class="muted">${d.webhook ? 'Sent every morning to the configured webhook.' : 'Set ALERT_WEBHOOK_URL on the server to receive this every morning.'}</p>
            <div class="bar"><button class="btn" id="testalert">Send test alert</button><span id="alertres" class="muted"></span></div>
        </div>
        <div class="card"><h3>Spike alerts</h3><p class="muted">Checked every 15 minutes: socket errors, search timeouts and reports in the last hour versus the trailing 24-hour hourly average (fires at 3x, with a minimum count).</p></div>`;
    },
};

// ---------- wiring ----------
const state = { page: 'Overview' };

async function render() {
    const view = $('#view');
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.page === state.page ? 'page' : 'false'));
    view.innerHTML = '<p class="muted">Loading…</p>';
    try {
        view.innerHTML = await PAGES[state.page](state);
    } catch (err) {
        view.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
}

function go(page, extra = {}) {
    Object.assign(state, { page, ...extra });
    render();
}

document.addEventListener('change', (e) => {
    if (e.target.id === 'days') go(state.page, { days: Number(e.target.value) });
    if (e.target.id === 'status') go('Moderation', { status: e.target.value });
});

document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.page) return go(t.dataset.page);
    if (t.id === 'refresh') return render();
    if (t.id === 'apply') return go('Funnel', { ref: $('#ref').value.trim() });
    if (t.dataset.user) { e.preventDefault(); return go('Users', { user: t.dataset.user }); }
    if (t.dataset.resolve || t.dataset.dismiss) {
        const id = t.dataset.resolve || t.dataset.dismiss;
        const action = t.dataset.resolve ? document.querySelector(`[data-act="${id}"]`).value : 'none';
        const note = prompt('Resolution note (optional)') ?? '';
        await call(`/reports/${id}/resolve`, { method: 'POST', body: { status: t.dataset.resolve ? 'resolved' : 'dismissed', action, note } });
        return render();
    }
    if (t.dataset.mod) {
        const reason = prompt('Reason') || 'admin action';
        await call(`/users/${state.user}/moderate`, { method: 'POST', body: { action: t.dataset.mod, hours: 24, reason } });
        return render();
    }
    if (t.id === 'uexport') return download(`/users/${state.user}/export`, `user-${state.user}.json`);
    if (t.id === 'udelete') {
        if (!confirm('Delete this account and all its data? This cannot be undone.')) return;
        await call(`/users/${state.user}`, { method: 'DELETE' });
        return go('Users', { user: null });
    }
    if (t.id === 'testalert') {
        const r = await call('/alerts/test', { method: 'POST' });
        $('#alertres').textContent = r.delivered ? 'Delivered.' : (r.configured ? 'Webhook did not accept it.' : 'No webhook configured.');
    }
});

document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'usearch') return go('Users', { q: f.get('q'), user: null });
    if (e.target.id === 'rules') {
        await call('/settings', { method: 'POST', body: Object.fromEntries([...f].map(([k, v]) => [k, Number(v)])) });
        return render();
    }
    if (e.target.id === 'newref') {
        await call('/referrals', { method: 'POST', body: { label: f.get('label'), code: f.get('code') } });
        return render();
    }
    if (e.target.id === 'export') {
        const table = f.get('table');
        return download(`/export/${table}.csv?from=${f.get('from')}&to=${f.get('to')}`, `${table}-${f.get('from')}-${f.get('to')}.csv`);
    }
});

function logout() {
    if (token) fetch(`${API}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    token = null;
    sessionStorage.removeItem(KEY);
    showLogin();
}

function start(email) {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who').textContent = email || '';
    $('#tabs').innerHTML = Object.keys(PAGES).map(p => `<button data-page="${esc(p)}">${esc(p)}</button>`).join('');
    render();
}

async function signIn(body) {
    try {
        const r = await call('/login', { method: 'POST', body });
        token = r.token;
        sessionStorage.setItem(KEY, token);
        sessionStorage.setItem('uc_admin_email', r.email);
        start(r.email);
    } catch (err) {
        $('#loginerr').textContent = err.message === 'not_an_admin' ? 'This account is not on the admin allow-list.' : err.message;
    }
}

async function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    if (['localhost', '127.0.0.1'].includes(location.hostname)) $('#devform').hidden = false;
    const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    if (cfg.googleClientId) {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = () => {
            google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: (r) => signIn({ idToken: r.credential }) });
            google.accounts.id.renderButton($('#gsi'), { theme: 'outline', size: 'large', width: 300 });
        };
        document.head.appendChild(s);
    } else if ($('#devform').hidden) {
        $('#loginerr').textContent = 'GOOGLE_CLIENT_ID is not configured on the server.';
    }
}

$('#devform').addEventListener('submit', (e) => { e.preventDefault(); signIn({ devToken: $('#devtoken').value }); });
$('#logout').addEventListener('click', logout);

if (token) start(sessionStorage.getItem('uc_admin_email')); else showLogin();
