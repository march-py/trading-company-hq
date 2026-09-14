# S03.3 — Schedules, Adapters & Automation Health

## Mission

S03.3 proves that the Trading Company automation backbone can run safely and observably without a local Mac process.

## Scheduled execution

DEV uses a Cloudflare Cron Trigger:

`*/15 * * * *`

Cron semantics are UTC.

The initial allowlisted job is:

`system_heartbeat`

Unknown cron expressions are rejected and do not dynamically execute arbitrary code.

## Scheduled job registry

Each scheduled job has:

- permanent job key
- explicit version
- expected cron
- adapter key
- bounded execution timeout

The initial job is `system_heartbeat` version `1`.

## Provider adapter contract

S03.3 introduces a generic typed provider adapter contract with:

- permanent adapter key
- explicit version
- `healthCheck()`
- `execute()`
- stable machine-safe failure codes
- bounded execution results

Only the internal `system_internal` adapter ships in S03.3.

No market-data, broker, exchange, TradingView, paid API, or external provider is integrated.

## Durable automation state

`automation_runs` stores bounded scheduled-run state.

Duplicate scheduled deliveries are deduplicated by:

`(environment, job_key, scheduled_for)`

`automation_heartbeats` stores append-only health evidence.

Heartbeat UPDATE, DELETE, and TRUNCATE are rejected.

## Automation health API

`GET /api/health/automation`

returns only bounded operational facts:

- environment
- scheduler health
- latest heartbeat time
- latest scheduled run status
- recent failure count
- server time

A heartbeat is healthy for up to 45 minutes.

Older heartbeats are stale.

Failed durable lookups or absence of heartbeat evidence report unavailable.

## Cost and usage baseline

The initial DEV schedule has at most 96 normal cron opportunities per day.

The heartbeat adapter performs zero paid-provider calls.

There is no recursive scheduling and no unbounded scheduled retry loop.

## Environment separation

DEV and PROD maintain separate configuration.

The repository reserves the equivalent PROD cron declaration, but S03.3 does not deploy or mutate PROD.

## Secrets

Secrets remain runtime bindings.

No provider adapter receives the complete runtime environment unnecessarily.

The initial system adapter requires no new provider credential.

## Laptop-off acceptance

S03.3 requires a natural Cloudflare cron invocation after DEV deployment.

Acceptance requires durable evidence in `automation_runs` and `automation_heartbeats`, truthful automation health, preservation of S03.2 event ingress/queue behavior, and no unexpected dead letters.

## Safety

Trading Company V1 does not independently execute live trades.

S03.3 does not grant broker or exchange authority and does not add TradingView-specific behavior.
