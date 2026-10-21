// LpuTV service worker: offline app shell and push notifications.
const SHELL = 'uc-shell-v2';
const SHELL_FILES = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

// Navigations: network first, cached shell when offline. Hashed assets: cache first.
self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put('/', copy));
            return res;
        }).catch(() => caches.match('/')));
        return;
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/strip/') || url.pathname.startsWith('/icons/')) {
        e.respondWith(caches.match(req).then(hit => hit || fetch(req).then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
            return res;
        })));
    }
});

self.addEventListener('push', (e) => {
    let data = {};
    try { data = e.data.json(); } catch { data = { title: 'LpuTV', body: e.data?.text() }; }
    e.waitUntil(self.registration.showNotification(data.title || 'LpuTV', {
        body: data.body || '',
        tag: data.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/' },
    }));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = e.notification.data?.url || '/';
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const open = list.find(c => new URL(c.url).origin === location.origin);
        if (open) { open.focus(); return open.navigate(url); }
        return self.clients.openWindow(url);
    }));
});
