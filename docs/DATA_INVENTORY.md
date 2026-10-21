# Data inventory (DPDP Act 2023)

What LpuTV holds, why, where, and for how long. Keep this in sync with `/privacy` (`frontend/src/screens/Legal.jsx`) and the schema in `backend/migrations/`.

| Data | Table / place | Purpose | Lawful basis | Retention | Who can see it |
|---|---|---|---|---|---|
| Guest handle, chosen gender, bio, interests | `users` | Account, matching | Consent | Until account deletion | The user; friends see name/bio after reveal; admins |
| Google email, name, verified flag | `users` | Login, verified badge | Consent | Until account deletion | The user; admins (email never shown to other users) |
| Public id (random) | `users.public_id` | Addressing friends without emails | Consent | Until deletion | Friends, admins |
| Friend list | `friends` | Direct chat | Consent | Until either side deletes or unfriends | The two users |
| Blocks | `blocks` | Safety | Consent / legitimate safety | Until deletion | Nobody (enforced silently) |
| Consent records (18+, terms, privacy) with version and time | `consents` | Proof of consent | Legal obligation | Until deletion | Admins |
| Hashed device id | `users.device_hash`, `device_bans` | Ban evasion control | Legitimate safety | Until deletion / ban expiry | Nobody (hash only) |
| Session tokens (SHA-256 only) | `sessions` | Staying logged in | Contract | 7 days, purged hourly | Nobody |
| Usage events with pseudonymous id (HMAC of public id), never email or text | `events` | Product analytics | Consent | 90 days raw, then `daily_stats` totals | Admins |
| Daily totals | `daily_stats` | Dashboards | Consent | Indefinitely (aggregate, not personal) | Admins |
| Reports (reporter, reported, reason, optional note, chat metadata) | `reports` | Moderation | Legitimate safety | 1 year after closing; open ones kept | Admins |
| Admin actions | `audit_log` (append-only) | Accountability | Legal obligation | Indefinitely | Admins |
| Push subscription endpoint and keys | `push_subscriptions` | Notifications (opt-in) | Consent | Until turned off or deletion | Nobody |
| Backups | `BACKUP_DIR`, off-site rclone remote | Recovery | Legitimate interest | 14 days | Operator |
| Server logs | pm2 / Render logs | Operations | Legitimate interest | 14 days | Operator. No emails, tokens or message text (pino redaction) |

## Never stored

- Message text: relayed through the socket server only (`backend/src/realtime/index.js`, `send_message`). A test (`X4` in `backend/test/realtime.test.js`) scans every table for a sent message.
- Audio and video: peer-to-peer (or through TURN, which relays encrypted media and stores nothing).
- IP addresses: held in memory by the rate limiter only.

## Rights, implemented

| Right | How |
|---|---|
| Access / portability | Dashboard → Settings → Download my data (`GET /api/me/export`); admin can export per user |
| Correction | Bio and interests editable any time |
| Erasure | Dashboard → Delete my account (`DELETE /api/me`): removes user, friends, consents, sessions, blocks, push subscriptions; reports keep a pseudonymous marker; events are re-labelled `deleted` immediately |
| Withdraw consent | Same as erasure |
| Grievance | Contact shown on /safety and /privacy (set `VITE_GRIEVANCE_NAME`, `VITE_GRIEVANCE_EMAIL`) |
