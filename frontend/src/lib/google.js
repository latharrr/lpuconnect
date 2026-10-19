// Google Identity Services, loaded only when a client id is configured.
let loading = null;

export function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google);
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = () => resolve(window.google);
            s.onerror = () => { loading = null; reject(new Error('google_unavailable')); };
            document.head.appendChild(s);
        });
    }
    return loading;
}

export async function renderGoogleButton(el, clientId, onCredential, locale) {
    const google = await loadGoogle();
    google.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), ux_mode: 'popup' });
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: el.offsetWidth || 320, locale });
}
