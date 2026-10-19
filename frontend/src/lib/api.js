import { API_URL, APP_VERSION, COOKIE_AUTH } from './config.js';
import { getToken } from './session.js';

// App-wide signals: the shell listens and reacts (log out, show the warm-up screen, ban notice).
export const bus = new EventTarget();
const signal = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export class ApiError extends Error {
    constructor(status, code, message) {
        super(message || code);
        this.status = status;
        this.code = code;
    }
}

let slowCount = 0;

export async function api(path, { method = 'GET', body, auth = true, timeoutMs = 75_000 } = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION };
    const token = auth ? getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    // A cold free-tier server can take a minute; after 3 s show the warm-up screen.
    let fired = false;
    const slow = setTimeout(() => { fired = true; if (slowCount++ === 0) signal('slow', true); }, 3000);
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(API_URL + path, {
            method, headers, signal: ctrl.signal,
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: COOKIE_AUTH ? 'include' : 'omit',
        });
    } catch {
        throw new ApiError(0, 'network', "Couldn't reach the server. Check your connection and try again.");
    } finally {
        clearTimeout(kill);
        clearTimeout(slow);
        if (fired && --slowCount === 0) signal('slow', false);
    }

    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401 && auth) signal('unauthorized');
        if (res.status === 403 && data.error === 'banned') signal('banned', data.message);
        throw new ApiError(res.status, data.error || 'error', data.message || messageFor(data.error));
    }
    return data;
}

function messageFor(code) {
    switch (code) {
        case 'rate_limited': return 'Too many tries. Wait a minute and try again.';
        case 'consent_required': return 'Please confirm you are 18+ and accept the terms first.';
        case 'bad_gender': return 'Pick one of the three options first.';
        default: return 'Something went wrong. Try again.';
    }
}

export const fileUrl = (path) => API_URL + path;
