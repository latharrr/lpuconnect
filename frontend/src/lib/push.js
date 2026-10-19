// Opt-in web push for "a friend wants to chat". Needs the service worker and a VAPID key.
import { api } from './api.js';
import { IS_NATIVE } from './config.js';

export const pushSupported = () => !IS_NATIVE && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function pushState() {
    if (!pushSupported()) return 'unsupported';
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
}

export async function enablePush(vapidPublicKey) {
    if (!pushSupported() || !vapidPublicKey) throw new Error('unsupported');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });
    await api('/api/me/push', { method: 'POST', body: { subscription: sub.toJSON() } });
}

export async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    await api('/api/me/push', { method: 'DELETE' });
}
