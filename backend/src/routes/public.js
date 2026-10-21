import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { ping } from '../db.js';
import { track, CLIENT_EVENTS, bufferedCount, eventStats } from '../events.js';
import { validateSession, bearer } from '../sessions.js';
import { getUser, userCache, friendCache } from '../users.js';
import { requireAuth } from './auth.js';
import { INTERESTS, BIO_MAX, NAME_MAX } from './me.js';
import { liveStats } from '../realtime/index.js';
import { lagMs } from '../health.js';
import { HttpError } from '../errors.js';

export const publicRouter = Router();

publicRouter.get('/config', (_req, res) => {
    res.json({
        googleClientId: config.googleClientId || null,
        verifiedDomains: config.verifiedDomains,
        vapidPublicKey: config.vapidPublic || null,
        interests: INTERESTS,
        bioMax: BIO_MAX,
        nameMax: NAME_MAX,
        chatMinutes: 10,
        videoUnlockSeconds: 30,
    });
});

// Client-side analytics. Allow-listed event names only; identity comes from the token, never the body.
publicRouter.post('/events', (req, res) => {
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
    const email = validateSession(bearer(req));
    for (const e of list) {
        if (!e || !CLIENT_EVENTS.has(e.event)) continue;
        track(e.event, {
            email: email || undefined,
            sessionId: typeof e.sessionId === 'string' ? e.sessionId.slice(0, 40) : null,
            props: e.props,
            ref: e.ref,
            device: e.device,
            appVersion: e.appVersion,
        });
    }
    res.status(204).end();
});

// Short-lived TURN credentials (coturn "use-auth-secret" REST scheme).
publicRouter.get('/turn', requireAuth(), (req, res) => {
    const iceServers = [{ urls: config.stunUrls }];
    if (config.turnUrls.length && config.turnSecret) {
        const expiry = Math.floor(Date.now() / 1000) + config.turnTtlSec;
        const username = `${expiry}:${req.user.public_id}`;
        const credential = crypto.createHmac('sha1', config.turnSecret).update(username).digest('base64');
        iceServers.push({ urls: config.turnUrls, username, credential });
    }
    res.json({ iceServers, ttl: config.turnTtlSec });
});

export function healthHandler(_req, res) {
    let dbOk = false;
    try { dbOk = ping(); } catch { dbOk = false; }
    const mem = process.memoryUsage();
    const body = {
        ok: dbOk,
        db: dbOk ? 'ok' : 'unreachable',
        release: config.release,
        uptimeSec: Math.round(process.uptime()),
        memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
        eventLoopLagMs: lagMs(),
        ...liveStats(),
        events: { buffered: bufferedCount(), ...eventStats },
        cache: { users: userCache.stats(), friends: friendCache.stats() },
    };
    res.status(dbOk ? 200 : 503).json(body);
}

export function optionalUser(req) {
    const email = validateSession(bearer(req));
    return email ? getUser(email) : null;
}

export { HttpError };
