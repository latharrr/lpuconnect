// Fire-and-forget client events, batched. Never send message text or names.
import { API_URL, APP_VERSION, PLATFORM, COOKIE_AUTH } from './config.js';
import { getToken, sessionId, getRef } from './session.js';

let queue = [];
let timer = null;

function send() {
    timer = null;
    if (!queue.length) return;
    const events = queue.splice(0, 20);
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`${API_URL}/api/events`, {
        method: 'POST', headers, keepalive: true, body: JSON.stringify({ events }),
        credentials: COOKIE_AUTH ? 'include' : 'omit',
    }).catch(() => {});
    if (queue.length) timer = setTimeout(send, 1000);
}

export function track(event, props) {
    queue.push({ event, props, sessionId: sessionId(), ref: getRef(), device: PLATFORM, appVersion: APP_VERSION });
    if (!timer) timer = setTimeout(send, 1500);
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', send);
}
