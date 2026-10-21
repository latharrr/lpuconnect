# LpuTV runbook

One page for when something is wrong. Commands assume the VPS layout in `deploy/` (pm2, nginx, `/srv/lputv`). On Render, use the dashboard equivalents noted in brackets.

## Where things are

| Thing | Location |
|---|---|
| Frontend | Vercel project `lputv`, live at https://lputv.vercel.app (deploys on push to `main`) |
| API (today) | VPS: pm2 `uniconnect` behind nginx, https://api.lpu.picapool.tech (deploy: `deploy/deploy.sh`) |
| API (target) | VPS: pm2 app `uniconnect` on :3001 behind nginx; staging `uniconnect-staging` on :3101 |
| Config | `/etc/lputv/production.env` and `staging.env` (template: `backend/.env.example`) [Render: Environment tab] |
| Database | `DB_PATH` (SQLite, WAL). Local backups in `BACKUP_DIR`, 14 kept, plus nightly off-site copy via rclone |
| Logs | `/var/log/lputv/*.log` (JSON lines, rotated daily, 14 kept) [Render: Logs tab] |
| Admin | `https://<api-host>/admin` (Google sign-in, `ADMIN_EMAILS` allow-list) |
| Health | `GET /health`: 200 with JSON when up, 503 when the database is unreachable |

## Is it up?

```bash
curl -s https://<api-host>/health | jq        # db, queue, rooms, memory, event-loop lag
node deploy/smoke.mjs https://<api-host>       # real guest login + socket handshake, then deletes the test user
pm2 status && pm2 logs uniconnect --lines 100
```

Uptime monitor (UptimeRobot or Healthchecks.io, free): HTTP check on `/health` every 1 minute, alert after 2 failures to WhatsApp/email. That meets "alert within 2 minutes of an outage".

## Restart

```bash
pm2 reload uniconnect          # graceful: tells clients, flushes analytics, closes the DB
pm2 restart uniconnect         # hard restart if reload hangs
sudo systemctl reload nginx    # after nginx config edits (nginx -t first)
```
[Render: Manual Deploy → Restart service. Remember this wipes the database on the free tier.]

## Deploy

```bash
deploy/deploy.sh --staging origin/main   # always staging first
deploy/deploy.sh origin/main             # production
```
The script builds the release, boots it on :3199 against a copy of the live database, runs the smoke test, then swaps and reloads. If the live check fails it rolls back on its own. A failed gate changes nothing.

## Roll back

```bash
ls -1t /srv/lputv/releases            # newest first
ln -sfn /srv/lputv/releases/<sha> /srv/lputv/current && pm2 reload uniconnect
```
[Render: Events → pick the previous deploy → Rollback. Vercel: Deployments → previous → Promote.]

## Restore the database

```bash
pm2 stop uniconnect
cp /var/lib/lputv/uniconnect.sqlite /var/lib/lputv/broken-$(date +%F).sqlite
rm -f /var/lib/lputv/uniconnect.sqlite-wal /var/lib/lputv/uniconnect.sqlite-shm
cp /var/lib/lputv/backups/<file>.sqlite /var/lib/lputv/uniconnect.sqlite   # or: rclone copy gdrive:uniconnect-backups/<file> .
pm2 start uniconnect && node deploy/smoke.mjs http://127.0.0.1:3001
```
Monthly drill (cron, see `deploy/crontab`): `node scripts/restore-drill.mjs` must print `RESTORE DRILL PASSED`.

## Common incidents

| Symptom | Likely cause | Fix |
|---|---|---|
| Everyone logged out | Sessions table lost (Render redeploy wiped the disk) | Expected on Render free; move to the VPS |
| "Couldn't reach the server" on the site | API down or CORS | `/health`; check `ALLOWED_ORIGINS` includes the frontend origin |
| Video connects on Wi-Fi but not on mobile data | No TURN relay | Configure coturn and `TURN_URLS`/`TURN_SECRET` (`deploy/coturn.conf`) |
| Memory climbing | Leak or traffic spike | `pm2 monit`; pm2 restarts at 400 MB on its own; check `/admin` Live |
| Report spike alert | Abuse wave | `/admin` Moderation; lower `autoban_reports` temporarily |
| Spam of new guests | Ban evasion | Device bans apply automatically; check Users for the pattern |

## Contacts

| Role | Who |
|---|---|
| Owner / on call | Deepanshu Lathar (fill phone/WhatsApp here) |
| Grievance officer (DPDP) | Set `VITE_GRIEVANCE_NAME` / `VITE_GRIEVANCE_EMAIL`; shown on /safety and /privacy |
| Hosting | Render support / VPS provider panel |
