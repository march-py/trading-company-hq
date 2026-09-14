# S04.1 — Pine / Webhook Contract

## Purpose

S04.1 adds a TradingView-specific webhook adapter to the accepted S03 event-ingress foundation.

It does not create a second event system.

Valid TradingView alerts normalize into Event Envelope V1, use the existing idempotent event store, and dispatch through the existing Cloudflare Queue path.

## Route

`POST /api/webhooks/tradingview/<opaque-route-token>`

The route token is a high-entropy runtime secret.

Invalid route tokens return:

`404 not_found`

The token must never be committed, logged, stored in durable reports, or returned in responses.

## Required payload fields

- `contract_version`
- `source`
- `signal_type`
- `strategy_id`
- `strategy_version`
- `exchange`
- `ticker`
- `interval`
- `bar_time`
- `triggered_at`
- `payload`

`contract_version` must equal `1`.

`source` must equal `tradingview`.

## Optional fields

- `direction`
- `price`
- `open`
- `high`
- `low`
- `close`
- `volume`
- `alert_name`
- `setup_key`

Unknown root fields are rejected.

Strategy-specific extension data belongs inside `payload`.

## TradingView alert JSON

```json
{
  "contract_version": 1,
  "source": "tradingview",
  "signal_type": "signal.detected",
  "strategy_id": "htf_sfp_v1",
  "strategy_version": 1,
  "exchange": "{{exchange}}",
  "ticker": "{{ticker}}",
  "interval": "{{interval}}",
  "bar_time": "{{time}}",
  "triggered_at": "{{timenow}}",
  "open": {{open}},
  "high": {{high}},
  "low": {{low}},
  "close": {{close}},
  "volume": {{volume}},
  "payload": {}
}

## Normalization

Valid requests become Event Envelope V1 with:

- `event_type = tradingview.signal`
- `event_version = 1`
- `occurred_at = triggered_at`

Server-owned identifiers, hashes, environment, and ingestion time remain server-owned.

## Idempotency

TradingView does not provide the existing application `Idempotency-Key` header.

S04.1 derives deterministic idempotency from the exact raw request body and reuses the existing S03 idempotent event store.

Identical raw-body delivery maps to the same durable event.

## Scope boundary

No opportunity lifecycle is implemented in S04.1.

No broker or exchange order authority is introduced.

No automated live trading is introduced.

No PROD deployment occurs during repository Checkpoint A.
