// Central error capture: structured log, a ring buffer for the admin Live page,
// and Sentry when SENTRY_DSN is set.
import { logger } from './logger.js';
import { config } from './config.js';

const recent = [];
let sentry = null;

export async function initMonitoring() {
    if (!config.sentryDsn) return false;
    try {
        sentry = await import('@sentry/node');
        sentry.init({ dsn: config.sentryDsn, release: config.release, environment: config.isProd ? 'production' : 'development', tracesSampleRate: 0 });
        return true;
    } catch (err) {
        logger.warn({ err: err.message }, 'Sentry not available');
        return false;
    }
}

export function captureError(err, context = {}) {
    const entry = { ts: Date.now(), type: context.type || err?.name || 'Error', where: context.where || null, message: String(err?.message || err).slice(0, 200) };
    recent.push(entry);
    if (recent.length > 50) recent.shift();
    logger.error({ err, ...context }, entry.message);
    if (sentry) sentry.captureException(err, { tags: { where: context.where || 'unknown' } });
}

export const recentErrors = () => recent.slice().reverse();

export class HttpError extends Error {
    constructor(status, code, message) {
        super(message || code);
        this.status = status;
        this.code = code;
    }
}

export function errorMiddleware(err, req, res, _next) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    if (err?.message === 'cors_denied') return res.status(403).json({ error: 'origin_not_allowed' });
    captureError(err, { where: `${req.method} ${req.path}` });
    res.status(500).json({ error: 'internal_error' });
}
