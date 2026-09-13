# S03.1 Worker API and Event Ledger

Checkpoint A adds the append-only `public.event_ledger` migration and the authenticated `POST /api/events/ingest` Worker route. This repository change does not apply the migration or deploy the Worker.

## Runtime bindings

Configure these values only in the target runtime secret store or an ignored local `.dev.vars` file:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVENT_INGRESS_TOKEN`

Never commit their values. `APP_ENV` remains the Worker-owned environment marker from `wrangler.jsonc`.

## Request contract

The route accepts `application/json` and at most 65,536 raw request bytes. It requires `Authorization: Bearer <token>` and Event Envelope V1. The Worker rejects unknown root properties so clients cannot supply server-owned fields.

Required client fields are `contract_version: 1`, a lowercase dot-separated `event_type`, a positive integer `event_version`, and an object `payload`. Optional identity, provenance, subject, correlation, causation, and occurrence fields are validated before persistence.

The Worker owns `id`, `environment`, `request_id`, `ingested_at`, and the lowercase SHA-256 of the exact raw body. A success response is emitted with status 202 only after Supabase REST confirms the insert with status 201.

## Stable errors

- `unauthorized` — 401
- `unsupported_media_type` — 415
- `payload_too_large` — 413
- `invalid_event` — 400
- `persistence_unavailable` — 503
- `not_found` — 404 for other routes

## Checkpoint boundary

Checkpoint A intentionally contains no migration apply, Cloudflare deployment, idempotency uniqueness, queue, retry or dead-letter handling, TradingView logic, or opportunity data model.
