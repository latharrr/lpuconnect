// pm2 entry point. pm2 fork mode loads apps through ProcessContainerFork.js, so
// process.argv[1] never matches server.js and its self-start guard skips start().
// This file starts the server explicitly, with the same shutdown handling.
import { start, stop } from '../backend/server.js';
import { logger } from '../backend/src/logger.js';
import { captureError } from '../backend/src/errors.js';

const server = await start();

const graceful = (signal) => {
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    stop(server).then(() => process.exit(0), () => process.exit(1));
};
process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);
process.on('unhandledRejection', (err) => captureError(err, { where: 'unhandledRejection' }));
process.on('uncaughtException', (err) => {
    captureError(err, { where: 'uncaughtException' });
    graceful('uncaughtException');
});
