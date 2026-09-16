# S05.1 — Setup Finder & Opportunity Detail

Status: implementation candidate

## Mission

Turn the accepted S04 opportunity capture pipeline into a read-only operational review surface inside Trading Company HQ without introducing trade authority or inventing strategy rules that belong to S06.

## Implemented surface

- Setup Finder navigation entry in the persistent HQ shell.
- Opportunity queue loaded from `GET /api/opportunities` with status and ticker filters.
- Opportunity detail loaded from `GET /api/opportunities/:id`.
- Canonical `instrument_id` and optional `venue_instrument_id` shown as authoritative downstream identity.
- Provider exchange/ticker/interval retained as provenance/context.
- Source-event identifiers and lifecycle transitions shown for traceability.
- TradingView deep link available from the detail view.
- Explainability baseline verifies canonical identity, source linkage, and pinned strategy version.
- Explicit S06 boundary: deterministic strategy-rule evaluation is not fabricated in S05.1.
- Read-only behavior only; no POST/PATCH/DELETE actions or live-trade authority.

## Validation target

Repository `npm run check` must pass through protected-main CI before merge. DEV runtime validation should confirm Setup Finder loads current opportunities and detail records without weakening Cloudflare Access or mutating PROD.
