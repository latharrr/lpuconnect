// Small, failure-tolerant wrappers around storage. Private windows can throw on access.
const TOKEN_KEY = 'uc_token';

const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
export { store };

let memoryToken = null;

export const getToken = () => memoryToken || store.get(TOKEN_KEY);
export function setToken(token, persist = true) {
    memoryToken = token;
    if (persist && token) store.set(TOKEN_KEY, token);
    if (!token) store.del(TOKEN_KEY);
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Stable per install, used only (hashed server-side) for ban evasion checks.
export function deviceId() {
    let id = store.get('uc_device');
    if (!id) { id = uuid(); store.set('uc_device', id); }
    return id;
}

// Per tab: ties analytics events in one visit together.
let tabSession = null;
export function sessionId() {
    if (!tabSession) {
        try { tabSession = sessionStorage.getItem('uc_session') || uuid(); sessionStorage.setItem('uc_session', tabSession); } catch { tabSession = uuid(); }
    }
    return tabSession;
}

// ?ref= is captured once and kept for signup attribution.
export function captureRef() {
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && /^[\w-]{1,40}$/.test(ref)) { store.set('uc_ref', ref); return ref; }
    return null;
}
export const getRef = () => store.get('uc_ref');

export const onboarded = () => store.get('uc_onboarded') === '1';
export const setOnboarded = () => store.set('uc_onboarded', '1');

export const audioOnlyPref = () => store.get('uc_audio_only') === '1';
