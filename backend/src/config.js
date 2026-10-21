// All runtime configuration comes from the environment (.env in development).
// Production refuses to start when a required value is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = process.env.ENV_FILE || path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envFile);
}

const env = process.env;
const list = (v, fallback = []) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : fallback);
const int = (v, fallback) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10));

const isTest = env.NODE_ENV === 'test';
// Render sets RENDER=true on its services; treat that as production even without NODE_ENV.
const isProd = env.NODE_ENV === 'production' || (env.RENDER === 'true' && !isTest);
const PROD_ORIGINS = ['https://lputv.vercel.app', 'https://localhost', 'capacitor://localhost'];

export const config = {
    root: ROOT,
    isProd,
    isTest,
    port: int(env.PORT, 3001),
    trustProxy: env.TRUST_PROXY === undefined ? (isProd ? 1 : false) : (/^\d+$/.test(env.TRUST_PROXY) ? int(env.TRUST_PROXY) : env.TRUST_PROXY === 'true'),
    allowedOrigins: list(env.ALLOWED_ORIGINS, isProd ? PROD_ORIGINS : ['http://localhost:5173', 'http://localhost:4173', 'capacitor://localhost', 'https://localhost']),

    dbPath: env.DB_PATH || path.join(ROOT, 'data', 'uniconnect.sqlite'),
    backupDir: env.BACKUP_DIR || path.join(ROOT, 'data', 'backups'),
    backupKeep: int(env.BACKUP_KEEP, 14),

    sessionTtlMs: int(env.SESSION_TTL_HOURS, 24 * 7) * 60 * 60 * 1000,
    // httpOnly cookie sessions: only when the API shares a site with the app (e.g. api.example.com + example.com).
    cookieAuth: env.COOKIE_AUTH === 'true',
    cookieDomain: env.COOKIE_DOMAIN || '',
    deviceSalt: env.DEVICE_SALT || (isProd ? '' : 'dev-device-salt'),
    analyticsSalt: env.ANALYTICS_SALT || (isProd ? '' : 'dev-analytics-salt'),

    googleClientId: env.GOOGLE_CLIENT_ID || '',
    verifiedDomains: list(env.VERIFIED_DOMAINS, ['lpu.in']),
    adminEmails: list(env.ADMIN_EMAILS).map(e => e.toLowerCase()),
    adminDevToken: isProd ? '' : (env.ADMIN_DEV_TOKEN || ''),

    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET || '',
    turnTtlSec: int(env.TURN_TTL_SECONDS, 3600),
    stunUrls: list(env.STUN_URLS, ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']),

    vapidPublic: env.VAPID_PUBLIC_KEY || '',
    vapidPrivate: env.VAPID_PRIVATE_KEY || '',
    vapidSubject: env.VAPID_SUBJECT || '',

    sentryDsn: env.SENTRY_DSN || '',
    release: env.RELEASE || env.GIT_SHA || env.RENDER_GIT_COMMIT?.slice(0, 12) || 'dev',
    alertWebhookUrl: env.ALERT_WEBHOOK_URL || '',
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),

    retention: {
        eventsDays: int(env.RETAIN_EVENTS_DAYS, 90),
        reportsDays: int(env.RETAIN_REPORTS_DAYS, 365),
        sessionsDays: int(env.RETAIN_SESSIONS_DAYS, 30),
    },

    match: {
        prefFallbackMs: int(env.MATCH_PREF_FALLBACK_MS, 20_000),
        searchTimeoutMs: int(env.MATCH_SEARCH_TIMEOUT_MS, 5 * 60_000),
        recentPairMs: int(env.MATCH_RECENT_PAIR_MS, 15 * 60_000),
        reconnectGraceMs: int(env.RECONNECT_GRACE_MS, 20_000),
    },

    autoBan: {
        reports: int(env.AUTOBAN_REPORTS, 3),
        windowHours: int(env.AUTOBAN_WINDOW_HOURS, 24),
        banHours: int(env.AUTOBAN_HOURS, 24),
    },

    maxMemoryMb: int(env.MAX_MEMORY_MB, 400),

    // WhatsApp OTP login. Disabled unless OTP_ENABLED=true; sender is pluggable
    // ('dry' logs only, 'openwa' uses the Labs relay bridge, 'cloudapi' is the
    // future official sender). Limits double as the unofficial-sender ban shield.
    otp: {
        enabled: env.OTP_ENABLED === 'true',
        sender: env.OTP_SENDER || 'dry',
        ttlMs: int(env.OTP_TTL_SECONDS, 600) * 1000,
        codeAttempts: int(env.OTP_MAX_ATTEMPTS, 5),
        perNumberPerDay: int(env.OTP_PER_NUMBER_PER_DAY, 3),
        perIpPerHour: int(env.OTP_PER_IP_PER_HOUR, 10),
        dailyCap: int(env.OTP_DAILY_CAP, 100),
        minSendGapMs: int(env.OTP_MIN_SEND_GAP_MS, 10_000),
        resendGapMs: int(env.OTP_RESEND_GAP_SECONDS, 60) * 1000,
        hashSalt: env.OTP_HASH_SALT || env.DEVICE_SALT || (isProd ? '' : 'dev-otp-salt'),
        openwaUrl: env.OPENWA_SEND_URL || 'http://127.0.0.1:8787/admin/send',
        openwaSecret: env.OPENWA_SECRET || '',
        testPhones: list(env.OTP_TEST_PHONES),
    },
};

// Fail loudly on missing production config rather than running half-secured.
export function assertConfig(c = config) {
    if (!c.isProd) return;
    const missing = [];
    if (c.allowedOrigins.length === 0) missing.push('ALLOWED_ORIGINS');
    if (c.otp.enabled && !c.otp.hashSalt) missing.push('OTP_HASH_SALT (or DEVICE_SALT)');
    if (c.otp.enabled && c.otp.sender === 'openwa' && !c.otp.openwaSecret) missing.push('OPENWA_SECRET');
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
