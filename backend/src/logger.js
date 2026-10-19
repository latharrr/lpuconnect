// Structured JSON logs. Emails, tokens and message text are never logged.
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
    level: config.logLevel,
    base: { release: config.release },
    redact: {
        paths: ['email', '*.email', 'token', '*.token', 'text', '*.text', 'req.headers.authorization'],
        censor: '[redacted]',
    },
});
