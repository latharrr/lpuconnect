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

- **Today:** push to `main`. Vercel builds `frontend/`; Render builds `backend/` (turn on Auto-Deploy in Render settings). Render free sleeps when idle and wipes the database on every deploy.
- **Target:** a VPS with persistent disk. Follow `docs/RUNBOOK.md` and `deploy/`. `deploy/deploy.sh --staging` then `deploy/deploy.sh`.

## License

MIT
