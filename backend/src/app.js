import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { publicRouter, healthHandler } from './routes/public.js';
import { adminRouter } from './admin/routes.js';
import { errorMiddleware } from './errors.js';

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);

    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
                frameSrc: ['https://accounts.google.com'],
                connectSrc: ["'self'", 'https://accounts.google.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
            },
        },
        hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }));

    app.use(cors({
        origin(origin, cb) {
            if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error('cors_denied'));
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }));

    const limiter = (windowMs, limit) => rateLimit({
        windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
        message: { error: 'rate_limited' },
        skip: () => config.isTest && !process.env.TEST_RATE_LIMITS,
    });

    app.use(express.json({ limit: '10kb' }));

    app.get('/health', healthHandler);
    app.use('/api/auth', limiter(60_000, 10), authRouter);
    app.use('/api/events', limiter(60_000, 60));
    app.use('/api', limiter(15 * 60_000, 300));
    app.use('/api', publicRouter);
    app.use('/api/me', meRouter);

    app.use('/admin/api', limiter(60_000, 120), adminRouter);
    app.use('/admin', express.static(path.join(config.root, 'admin'), { index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));

    app.use((req, res) => res.status(404).json({ error: 'not_found' }));
    app.use(errorMiddleware);
    return app;
}
