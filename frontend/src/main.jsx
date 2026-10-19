import 'regenerator-runtime/runtime';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource-variable/archivo';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { IS_NATIVE, APP_VERSION } from './lib/config.js';

// Optional error monitoring: only loaded when a DSN is configured.
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
    import('@sentry/react').then((Sentry) => {
        Sentry.init({ dsn, release: APP_VERSION, tracesSampleRate: 0 });
        window.__ucReportError = (err) => Sentry.captureException(err);
    }).catch(() => {});
}

// Service worker: offline shell and push notifications (web only, production builds).
if (import.meta.env.PROD && !IS_NATIVE && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <I18nProvider>
            <ToastProvider>
                <App />
            </ToastProvider>
        </I18nProvider>
    </ErrorBoundary>,
);
