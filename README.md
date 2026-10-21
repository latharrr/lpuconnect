# LpuTV

A photo booth for conversation. Two university students are paired at random for a ten-minute anonymous chat, with optional video. If both tap "Enjoying this" they can add each other, and names are revealed only when both accept.

**Live:** https://lputv.vercel.app · **API:** https://api.lpu.picapool.tech (`/health`, `/admin`)

## How it fits together

```
frontend/   React 19 + Vite. Screens in src/screens, hooks/libs in src/lib, Hindi + English (src/i18n).
            PWA (sw.js, manifest), Capacitor Android wrapper in android/ (not distributed).
backend/    Node 22 + Express 5 + Socket.IO, SQLite via node:sqlite (WAL, versioned migrations).
            src/routes (auth, me, public), src/realtime (matching queue, rooms, presence, WebRTC signalling),
            src/admin (metrics + API), admin/ (admin panel UI), jobs (rollups, retention, backups, alerts).
deploy/     pm2, nginx, coturn, deploy.sh (gated, auto-rollback), smoke test, cron, logrotate.
e2e/        Playwright: two browsers with fake camera/mic run the whole flow.
docs/       Runbook, data inventory, breach plan, decisions, load test report.
```

### What the server guarantees

- **Nobody is identified before both say yes.** Strangers get a random alias; names and profiles are sent only after mutual friend acceptance. Emails never leave the server.
- **Every room action is authorised.** Sockets need a valid session; every event checks room membership; enjoy, friend, extend and video steps need both sides, tracked server-side.
- **Messages and video are never stored.** Text is relayed only; video is peer-to-peer (or relayed by your own TURN). Tests scan the database to prove it.
- **Safety:** Report (with reason and note) ends the chat and blocks the pair; several distinct reports suspend an account automatically; device-level bans stop instant re-registration; all admin actions go to an append-only audit log.
- **Consent:** 18+, terms and privacy consent stored with a timestamp; export and delete your data from Settings.

## Run it locally

```bash
cd backend && npm install && npm run dev          # http://localhost:3001  (data in backend/data/)
cd frontend && npm install && npm run dev         # http://localhost:5173
```

Admin panel locally: start the backend with `ADMIN_DEV_TOKEN=dev`, open http://localhost:3001/admin and sign in with `dev`.

## Tests

```bash
cd backend && npm test                 # 39 tests: auth, room authorisation (B1-B6), queue, cleanup, migrations, backups, admin, CSV
cd backend && npm run test:coverage    # ~84% of lines
cd frontend && npm run lint && npm run build
cd e2e && npm install && npx playwright install chromium && npx playwright test
cd backend && npm run loadtest         # see docs/LOADTEST.md
```

CI (`.github/workflows/ci.yml`) runs all of this on every push plus `npm audit` and a gitleaks secret scan.

## Configuration

Backend: `backend/.env.example` (every variable explained). On Render none are required: it detects `RENDER=true`, allows `https://lputv.vercel.app`, and generates its secrets on first boot. Set `GOOGLE_CLIENT_ID` + `ADMIN_EMAILS` for Google sign-in and the admin panel, `TURN_*` for reliable video across mobile networks, `VAPID_*` (`npm run vapid`) for push, `ALERT_WEBHOOK_URL` for the daily digest and spike alerts.

Frontend: `frontend/.env.example` (`VITE_BACKEND_URL`, optional `VITE_SENTRY_DSN`, grievance contact).

## Deploy

- **Frontend:** push to `main`; Vercel builds and serves https://lputv.vercel.app.
- **Backend:** runs on an Oracle Cloud VPS under pm2 (app `uniconnect`, Node 22, port 3001, behind nginx at https://api.lpu.picapool.tech). `deploy/deploy.sh` fetches `main`, installs, gates the new release on a spare port with a smoke test, then reloads pm2 and auto-rolls back on failure. `deploy/deploy.sh --staging` deploys to a parallel staging app on port 3101. Layout: `/srv/uniconnect` (bare mirror, working clone, `releases/<sha>`, `current` symlink). See `docs/RUNBOOK.md`.
- **Video:** coturn on the same host (`turn.lpu.picapool.tech`, UDP/TCP 3478, TLS 5349); the app advertises it via `TURN_URLS`.

### Production configuration

Backend env lives in `/etc/uniconnect/production.env` (loaded via `ENV_FILE`; never committed). Names only - see `backend/.env.example` for the full list and meanings: `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, `ALLOWED_ORIGINS`, `DB_PATH`, `TURN_URLS`/`TURN_SECRET`, `VAPID_*`, `ALERT_WEBHOOK_URL`, `SENTRY_DSN`, `GROQ_API_KEY`, `ANALYTICS_SALT`, `DEVICE_SALT`, `BACKUP_DIR`, `BACKUP_REMOTE`.

### Backups

Nightly at 01:15 UTC (user crontab): `scripts/backup.mjs` snapshots the SQLite database, keeps the last 9 locally under `/srv/uniconnect/data/backups/`, and ships a copy to Google Drive via rclone (`gdrive:uniconnect-backups`). Backup config is in `deploy/crontab.txt`.

### Monitoring

- `GET /health` on the API returns release, uptime, memory, queue and cache stats.
- Sentry (`SENTRY_DSN`, org `lputv`, project `lputv-backend`) captures unexpected server errors; init is in `backend/src/errors.js` and is a no-op when the DSN is unset.
- Daily digest + spike alerts go to `ALERT_WEBHOOK_URL`.

### Admin panel

`https://api.lpu.picapool.tech/admin` - sign in with Google; only emails in `ADMIN_EMAILS` get in. All admin actions land in an append-only audit log.

### Legal

In-app pages: Privacy, Terms and Rules (`frontend/src/screens/Legal.jsx`). The grievance contact shown there is set with `VITE_GRIEVANCE_NAME` / `VITE_GRIEVANCE_EMAIL`. Data export and account deletion are self-serve in Settings.

## License

MIT
