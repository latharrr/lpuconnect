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

## VPS run (production hardware), 2026-10-21

Same script and workload, run against an isolated copy of the production release (6bd15470bfae) on the live Oracle Cloud VPS (2 vCPU, 12 GB, Node 22, shared with unrelated services), clients on the same machine. Production traffic and database untouched; the test instance used a throwaway database, deleted after.

| Concurrent users | Matched | Failed | p95 match (ms) | Peak server CPU (1 core) | Peak server RSS (MB) |
|---|---|---|---|---|---|
| 500 | 500/500 | 0 | 1920 | 15% | 129 |
| 1000 | 1000/1000 | 0 | 1872 | 19% | 142 |
| 2000 | 2000/2000 | 0 | 1959 | 26% | 252 |
| 3000 | 3000/3000 | 0 | 2410 | 32% | 257 |
| 4000 | 4000/4000 | 0 | 2793 | 36% | 374 |
| 6000 | 6000/6000 | 0 | 3591 | 38% | 384 |
| 8000 | 8000/8000 | 0 | 4365 | 42% | 467 |
| 10000 | 10000/10000 | 0 | 5212 | 46% | 555 |

Raw results: `docs/loadtest-vps-results.json` (per-stage files merged from /tmp runs).

**Verified ceiling: 10,000 concurrent chatters with zero failures.** The spec target (p95 under 5 s) holds through 8,000; at 10,000 the p95 slips to 5.2 s while CPU is only ~46% of one core, so the p95 knee is matching-loop queueing (plus client-harness contention on this shared 2-core box), not CPU or memory. RAM peaks at 555 MB for 10,000 connections.

**Nothing broke first.** No config change was needed on the server: pm2 already runs it with a 1,048,576 file-descriptor limit and SQLite WAL absorbs the write load. (The client harness needed `ulimit -n 65536`.)

**Production note:** real traffic goes through nginx and shares this VPS with other services, so plan operationally for a few thousand concurrent, with 8,000 as the measured spec-compliant ceiling and 10,000 as the failure-free maximum. Beyond that, stage 4 of the spec: Redis adapter, multiple processes, Postgres.

## VPS 20k-60k step test (spawned test server), 2026-10-21

Same script and workload, server spawned by the harness itself (NODE_ENV=test, in-memory DB, port 3999, release d06b3ce) on the live VPS, clients on the same machine. To pass ~64k loopback connections the harness now spreads clients over 127.0.0.1-8 (one ephemeral port range per source IP); before this fix the 20,000 stage died instantly with EADDRNOTAVAIL. `net.ipv4.ip_local_port_range` was widened to 10240-65535 during the run and restored after. Production was untouched (users count 6 before and after).

| Concurrent users | Matched | Timed out (>20s) | p50 match (ms) | p95 match (ms) | Peak server CPU (1 core) | Peak server RSS (MB) | Peak event-loop lag (ms) |
|---|---|---|---|---|---|---|---|
| 20000 | 20000 | 0 | 3596 | 7644 | 97% | 890 | 49 |
| 30000 | 30000 | 0 | 5217 | 10471 | 96.7% | 1315 | 54 |
| 40000 | 40000 | 0 | 7122 | 16127 | 97.1% | 1687 | 57 |
| 60000 | 60000 | 3446 (5.7%) | 10735 | 25613 | 98% | 1977 | 13338 |

Raw results: `docs/loadtest-vps-60k-results.json`.

**What breaks first: the single-threaded event loop.** The server process pins one core (~97%) from 20,000 users up; match latency and event-loop lag grow with it, and at 60,000 the loop lag hits 13 s and 5.7% of clients exceed the 20 s match timeout (they do match eventually - "matched" counts every socket that ever matched, "timed out" counts those past the client timeout). RAM (2 GB at 60,000), file descriptors and SQLite were never close to their limits. No crash, no error, production unaffected.

**Harness note:** the client harness ran on the same box on the second core (80-90% CPU). Because the server core is saturated at every stage here, the server - not harness contention - is the measured bottleneck above ~20k; at lower stages (the 10k table above, server at 46%) on-box contention can inflate p95. An off-box harness isolates this: it needs ingress to the test port restricted to the client IP (or an SSH tunnel), Node 22+, `ulimit -n 65536+`, and either multiple client machines or client-side IP aliasing past ~64k sockets (one ephemeral range per source IP).

**Using all cores for the server itself** needs stage 4 of the spec (Redis adapter + multiple processes); the app is single-process by design today.
