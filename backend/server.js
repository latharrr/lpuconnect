// UniConnect backend entry point.
import { createServer } from 'node:http';
import { config, assertConfig } from './src/config.js';
import { logger } from './src/logger.js';
import { openDb, closeDb } from './src/db.js';
import { createApp } from './src/app.js';
import { setupRealtime, shutdownRealtime } from './src/realtime/index.js';
import { startEventFlusher, stopEventFlusher } from './src/events.js';
import { startJobs, stopJobs } from './src/jobs.js';
import { initMonitoring, captureError } from './src/errors.js';

export async function start({ port = config.port } = {}) {
    assertConfig();
    await initMonitoring();
    openDb();
    const app = createApp();
    const server = createServer(app);
    setupRealtime(server);
    startEventFlusher();
    if (!config.isTest) startJobs();
    await new Promise(r => server.listen(port, r));
    logger.info({ port: server.address().port, release: config.release }, 'server listening');
    return server;
}

let shuttingDown = false;
export async function stop(server) {
    if (shuttingDown) return;
    shuttingDown = true;
    stopJobs();
    await shutdownRealtime();
    await new Promise(r => server.close(() => r()));
    const flushed = stopEventFlusher();
    closeDb();
    logger.info({ flushed }, 'shutdown complete');
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
}
