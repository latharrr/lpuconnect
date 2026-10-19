// pm2 process file. `pm2 start deploy/ecosystem.config.cjs` from /srv/uniconnect/current.
// Production and staging run side by side on one VPS with capped memory so they never
// starve the other sites on the box.
const common = {
    script: 'server.js',
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '400M',
    node_args: '--max-old-space-size=384',
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
            name: 'uniconnect',
            cwd: '/srv/uniconnect/current/backend',
            env: { NODE_ENV: 'production', ENV_FILE: '/etc/uniconnect/production.env' },
            out_file: '/var/log/uniconnect/out.log',
            error_file: '/var/log/uniconnect/error.log',
        },
        {
            ...common,
            name: 'uniconnect-staging',
            cwd: '/srv/uniconnect-staging/current/backend',
            max_memory_restart: '250M',
            node_args: '--max-old-space-size=224',
            env: { NODE_ENV: 'production', ENV_FILE: '/etc/uniconnect/staging.env' },
            out_file: '/var/log/uniconnect/staging-out.log',
            error_file: '/var/log/uniconnect/staging-error.log',
        },
    ],
};
