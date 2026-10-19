# Load test report (spec P11)

Measured 2026-10-19 with `backend/scripts/loadtest.mjs`, Node v24.19.0, server in its own process, clients on the same machine (Apple silicon laptop). Each simulated student: guest login, socket connect, search (arrivals spread over 2 s), match, 10 messages each way, skip.

| Concurrent users | Matched | Failed | p50 match (ms) | p95 match (ms) | Peak server CPU | Peak RSS (MB) | Peak heap (MB) | Peak event-loop lag p99 (ms) |
|---|---|---|---|---|---|---|---|---|
| 100 | 100/100 | 0 | 1086 | 1915 | 11.1% | 97 | 24 | 22 |
| 500 | 500/500 | 0 | 1025 | 1919 | 22.8% | 161 | 50 | 27 |
| 1000 | 1000/1000 | 0 | 1000 | 1909 | 43.4% | 239 | 83 | 24 |
| 2000 | 2000/2000 | 0 | 1014 | 1876 | 54.2% | 290 | 127 | 24 |

Raw results: `docs/loadtest-results.json`.

## Reading it

- **Time to match is the arrival spread, not server delay.** Users start searching at random over 2 s, so the median wait is about 1 s. The server added no measurable queueing at 2,000.
- **CPU, not memory, is the limit.** About 54% of one core at 2,000 concurrent chatters, roughly 27% per 1,000. RSS stays under 300 MB.
- **No breaking point was reached at 2,000.** The spec target (p95 under 5 s) holds at every stage.

## What this means for hosting (estimates)

| Host | CPU | Comfortable concurrent chatters |
|---|---|---|
| Render free (0.1 shared vCPU, 512 MB) | ~1/10 of a slower core | about 100–200 at once; sleeps after 15 min idle; disk wiped on deploy |
| Small VPS (1 vCPU, 1 GB), shared with other sites, pm2 cap 400 MB | 1 core | about 1,500–2,000 at once |
| Beyond that | | Stage 4 of the spec: Redis adapter, multiple processes, Postgres (only when measured) |

The Render and VPS rows are scaled from this run by CPU share and are estimates. To measure a real host: raise `AUTH_RATE_LIMIT` there temporarily and run, from a different machine,

```bash
cd backend && node scripts/loadtest.mjs --url https://<api-host> --stages 50,100,200,500 --out ../docs/loadtest-<host>.json
```

Video does not load the server: media is peer-to-peer, or relayed by coturn when NAT blocks it (bandwidth, not CPU, is the cost there).
