# Decisions log

Short records of choices the spec asked to document, or that a future contributor would otherwise question.

**S5. No video moderation or recording.** Video is peer-to-peer and never touches the server. Frame scanning would mean routing or sampling everyone's video, which is a major privacy change for a student app. We rely on: mutual opt-in before video (and a 30 s lock for strangers), one-tap Report that ends the call and blocks, automatic suspension after several distinct reports, 18+ consent, and optional Google sign-in with a verified college badge. Revisit only with legal advice.

**B17. Gender is self-described.** It is chosen at sign-up, never verified, and not overwritten on later Google logins. No safety rule depends on it. It is shown to friends after reveal and is not used for matching.

**B20. PeerJS removed.** WebRTC offers, answers and ICE candidates now travel over the authenticated Socket.IO connection and only inside a room the server has authorised. This removed the public `/peerjs` endpoint and its default key.

**B21. No public TURN.** The shared `openrelayproject` credentials were removed. `/api/turn` returns STUN and, when configured, short-lived coturn credentials (`deploy/coturn.conf`). Until coturn runs, some calls between different mobile networks will fail to connect.

**X12. Session tokens.** Tokens are random 256-bit values stored only as SHA-256, valid 7 days and rotated on every resume. Web and Android send them as a Bearer header. When the API is served from the same site as the app, set `COOKIE_AUTH=true` (+ `VITE_AUTH_MODE=cookie`) to use an httpOnly, SameSite=Lax cookie instead, with an Origin check on writes. Not the default because the API (Render) and app (Vercel) are on different sites, where third-party cookies are blocked.

**F1. Verified badge.** Google accounts whose domain is in `VERIFIED_DOMAINS` (default `lpu.in`) get a badge. Guests can still chat and are unverified. "Verified" is shown only where it is true.

**F5. Push notifications.** Web push for "a friend wants to chat", opt-in, quiet 23:00–08:00 IST, at most one per friend per 30 minutes. The Android app (Capacitor WebView) cannot receive web push; native FCM needs a Firebase project (`google-services.json`) and `@capacitor/push-notifications`.

**F8. Deferred: stored direct-chat history and unread counts.** Both need message storage, which conflicts with X4 (never store message text). We store only `friends.last_chat_at`. Revisit after a DPDP review, with explicit consent and short retention.

**F9. Deferred: streaks.** The spec says only after retention data exists. Cohorts are now visible in Admin → Growth.

**P9 / P10. Deferred: Postgres and Redis.** Load testing (`docs/LOADTEST.md`) shows one Node process handles 2,000 concurrent chatters on one core. Trigger for P9: sustained writes over ~50/s or a second instance. Trigger for P10: needing more than one process.

**P8. Bundles.** The main bundle targets ES2020; `@vitejs/plugin-legacy` still emits a legacy bundle that only old Android WebViews download. Drop it once analytics (Admin → Quality → app versions/devices) shows no old devices.

**Hosting.** Render free remains usable for a pilot but wipes the database on every deploy and sleeps when idle. Everything needed for the VPS move is in `deploy/` and `docs/RUNBOOK.md`.
