import { defineConfig, devices } from '@playwright/test';

// Two real browsers (fake camera/mic) against a real backend and the built frontend.
export default defineConfig({
    testDir: '.',
    timeout: 120_000,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4319',
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
        permissions: ['camera', 'microphone'],
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
        {
            command: 'node server.js',
            cwd: '../backend',
            url: 'http://127.0.0.1:3311/health',
            env: { NODE_ENV: 'test', DB_PATH: ':memory:', PORT: '3311', ALLOWED_ORIGINS: 'http://127.0.0.1:4319', ANALYTICS_SALT: 'e2e', DEVICE_SALT: 'e2e' },
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'npx vite build && npx vite preview --host 127.0.0.1 --port 4319 --strictPort',
            cwd: '../frontend',
            url: 'http://127.0.0.1:4319',
            env: { VITE_BACKEND_URL: 'http://127.0.0.1:3311' },
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
