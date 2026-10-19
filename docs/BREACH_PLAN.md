# Personal data breach plan

Not legal advice. The DPDP Act 2023 and the DPDP Rules expect a breach to be reported to the Data Protection Board of India and to each affected person, without delay. Have this reviewed by someone qualified.

## First hour

1. **Contain.** Rotate whatever leaked: `ANALYTICS_SALT`/`DEVICE_SALT` only if the database leaked with them; revoke all sessions (`DELETE FROM sessions;` then everyone logs in again); rotate `TURN_SECRET`, `VAPID_*`, Google OAuth client secret, Render/Vercel/GitHub tokens as relevant.
2. **Preserve evidence.** Copy logs (`/var/log/uniconnect`), the current database and the latest backups somewhere read-only. Do not delete anything.
3. **Write down** what happened, when it was discovered, by whom, and what data is involved (use `docs/DATA_INVENTORY.md`).

## Within 72 hours

4. **Assess scope.** Which tables, how many people, which fields. Message text and video are never stored, so they cannot be part of a database breach.
5. **Notify the Data Protection Board of India** with: description, nature and extent, likely consequences, measures taken, contact person.
6. **Notify affected users** in plain language: what happened, what data, what we did, what they can do (for example delete their account), and who to contact. Template: `docs/B7_NOTICE.md`.
7. **Fix the cause** and add a regression test.

## Afterwards

8. Write a short post-mortem in `docs/` (timeline, root cause, fixes, what we will change).
9. Review whether retention periods can be shortened.

## Log of incidents

| Date | Incident | Status |
|---|---|---|
| 2026-10-19 | B7: `backend/uniconnect.sqlite` with 4 user records (emails incl. the owner's, names, genders, bios) and 2 friend rows was committed to the public GitHub repository. Purged from history and force-pushed on 2026-10-19. Treat as exposed. | Users to be notified (`docs/B7_NOTICE.md`); ask GitHub Support to purge cached views of old commits |
