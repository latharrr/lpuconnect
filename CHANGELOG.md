# Changelog

Built from the git history of `main`. Dates are commit dates. No version tags exist yet.

## 2026-10-21 to 2026-10-23: LpuTV
- Renamed the product from UniConnect to LpuTV across the UI, legal pages, admin, docs, deploy config and Android app id.
- Added WhatsApp OTP phone login: hashed storage, layered rate limits, kill switch.
- Added display-name editing.
- Fixed Hindi rendering (Devanagari font, `lang` attribute, label styling) and a 360 px phone-login overflow.
- Load tests on the production VPS: 10,000 concurrent users with zero failures, then a 20,000 to 60,000 step test on a spawned server. Harness fix for loopback port exhaustion.
- Recruiter-first README with screenshots, stack, hard problems and architecture diagram. Documented VPS deploy, backups, Sentry, admin and legal.
- Wake-up screen: honest slow-connection copy, removed the misleading 60 s countdown.

## 2026-10-18 to 2026-10-20: Rebuild
- Backend v2: secure auth, authorised rooms, matching queue, moderation, analytics, admin API.
- Frontend v2 and admin panel. Photo-booth redesign.
- Ops: CI, Playwright e2e, deploy gate with automatic rollback, backups, load test script.
- Security: strict script-src CSP, frontend origin allow-list, pm2 fork-mode boot fix, `.gitignore` encoding fix so databases and env files are ignored.
- Docs: runbook, data inventory, breach plan, decisions, load test report.
- Added the MIT LICENSE and removed dead live links.

## 2026-03-12 to 2026-03-21: First version (UniConnect)
- Anonymous random chat with timers, mutual enjoy and friend reveal, direct messages, WebRTC video, Google sign-in, SQLite accounts, Android wrapper.
- Security hardening: rate limiting, CORS lockdown, session tokens, socket auth, sanitising, Helmet headers.
