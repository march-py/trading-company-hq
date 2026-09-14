# S03.2 — Queues, Idempotency & Failure Handling

## Scope

S03.2 extends the S03.1 immutable event-ingress foundation with bounded idempotency, asynchronous queue dispatch, retry handling, processing receipts, and durable dead-letter capture.

This stage does not introduce TradingView-specific behavior and does not authorize automated live trading.

## Ingress contract

`POST /api/events/ingest` retains the S03.1 authentication, JSON validation, event-envelope validation, raw-body SHA-256 hashing, and immutable event-ledger persistence requirements.

S03.2 additionally requires a valid `Idempotency-Key`.

The raw idempotency key is not stored. A lowercase SHA-256 hash is stored as `idempotency_key_sha256`.

The database enforces uniqueness on:

`(environment, idempotency_key_sha256)`

for non-null idempotency hashes.

Same key + same exact request body returns the original accepted event identity.

Same key + different request body returns `409 idempotency_conflict`.

## Acceptance ordering

Ingress acknowledgement ordering is:

1. validate request
2. persist immutable event ledger row
3. publish minimal queue message
4. return HTTP 202

A queue publication failure returns `503 dispatch_unavailable`.

The already-durable event remains available for a safe retry with the same idempotency key.

## Queue Message V1

The queue message contains only:

- `queue_contract_version`
- `event_id`
- `environment`

The queue is not the canonical event payload store. Consumers recover canonical event identity from the immutable event ledger.

## Processing receipts

`event_processing_receipts` provides bounded processing state:

- `processing`
- `succeeded`

The receipt records attempt count, queue message identity, timestamps, and stable machine error codes.

Already-succeeded duplicate deliveries are acknowledged without repeating processing.

## Retry behavior

Main queue processing uses bounded per-message retries.

Current configured retry delay:

`30 seconds`

Current configured main-queue retry count:

`3`

Failed main-queue messages are routed to the environment-specific DLQ.

## Dead letters

`event_dead_letters` is append-only.

DLQ persistence stores only bounded sanitized failure metadata. Invalid/raw queue bodies are not copied into durable dead-letter payloads.

Duplicate DLQ deliveries are tolerated through unique queue-message identity.

## Environment separation

DEV:

- `trading-company-events-dev`
- `trading-company-events-dlq-dev`

PROD names are reserved separately:

- `trading-company-events-prod`
- `trading-company-events-dlq-prod`

This repository checkpoint does not itself deploy PROD.

## Safety

S03.2 is infrastructure and event-processing work only.

It does not independently execute trades and does not alter the manual live-trade authority boundary.
