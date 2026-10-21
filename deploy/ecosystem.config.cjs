// pm2 process file. `pm2 start deploy/ecosystem.config.cjs` from /srv/lputv/current.
// Production and staging run side by side on one VPS with capped memory so they never
// starve the other sites on the box.
const common = {
    // Resolved against cwd (<release>/backend). server.js only self-starts when run
    // directly, which pm2 fork mode never does, so pm2 goes through deploy/pm2-entry.mjs.
    script: '../deploy/pm2-entry.mjs',
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '400M',
    node_args: ['--max-old-space-size=384'],
    kill_timeout: 12000,          // graceful shutdown flushes events and closes sockets
    listen_timeout: 15000,
    restart_delay: 2000,
    exp_backoff_restart_delay: 200,
    merge_logs: true,
    time: true,
};

module.exports = {
    apps: [
        {
            ...common,
            name: 'lputv',
            cwd: '/srv/lputv/current/backend',
            env: { NODE_ENV: 'production', ENV_FILE: '/etc/lputv/production.env' },
            out_file: '/var/log/lputv/out.log',
            error_file: '/var/log/lputv/error.log',
        },
        {
            ...common,
            name: 'lputv-staging',
            cwd: '/srv/lputv-staging/current/backend',
            max_memory_restart: '250M',
            node_args: ['--max-old-space-size=224'],
            env: { NODE_ENV: 'production', ENV_FILE: '/etc/lputv/staging.env' },
            out_file: '/var/log/lputv/staging-out.log',
            error_file: '/var/log/lputv/staging-error.log',
        },
    ],
};
