# S02.2 — Core Domain Data Dictionary

## Environment and scope

CLOUD treats the existing Supabase project as DEV. This repository package contains no project reference, host, key, password, account identifier, or credential. PROD is not provisioned or deployed by this task.

All first-class records use immutable UUID primary keys generated with `gen_random_uuid()`. Authoritative instants use `timestamptz`; applications display them in an explicit IANA timezone without replacing the stored instant. Foreign keys use internal IDs and `ON DELETE RESTRICT` so deactivation does not erase historical identity.

## `assets`

Normalized economic or reference assets.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `code`, `name` | Canonical human-readable identity; code is case-insensitively unique. |
| `asset_kind` | Constrained asset classification. |
| `is_active` | Lifecycle flag; retirement does not delete history. |
| `created_at`, `updated_at` | Record creation and latest mutable update instants. |

## `instruments`

Normalized product identity independent of provider aliases.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `canonical_code`, `name` | Canonical product identity; code is case-insensitively unique. |
| `instrument_type` | Constrained product type such as spot, perpetual, option, CFD, or reference. |
| `base_asset_id`, `quote_asset_id` | Optional Asset FKs for paired products. |
| `underlying_asset_id`, `settlement_asset_id` | Optional Asset FKs for exposure and settlement identity. |
| `contract_family`, `expiry_at` | Optional contract-family and dated-contract identity. |
| `is_active`, `created_at`, `updated_at` | Lifecycle and audit instants. |

Every asset FK is indexed for joins. Equal ticker text never implies equal instrument identity.

## `venues`

Exchange, broker, data venue, or index-provider context.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `code`, `name` | Venue identity; code is case-insensitively unique. |
| `venue_type` | Constrained venue classification. |
| `timezone_name` | Optional IANA timezone identity for venue/session interpretation. |
| `is_active`, `created_at`, `updated_at` | Lifecycle and audit instants. |

## `venue_instruments`

Venue-specific listing or contract linked to one Venue and one Instrument.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `venue_id`, `instrument_id` | Required indexed FKs to Venue and Instrument. |
| `market_scope`, `symbol`, `display_name` | Provider listing namespace and labels. |
| `tick_size`, `quantity_step`, `contract_multiplier` | Optional positive contract mechanics. |
| `trading_timezone` | Optional IANA timezone for trading/session rules. |
| `valid_from`, `valid_to` | Listing validity window; end must follow start. |
| `is_active`, `created_at`, `updated_at` | Lifecycle and audit instants. |

Only one open-ended listing may use the same case-insensitive venue, market scope, and symbol.

## `instrument_aliases`

Namespace-aware external alias mapping.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `namespace`, `alias` | External lookup key, unique case-insensitively while open-ended. |
| `instrument_id` | Optional FK to a venue-agnostic Instrument. |
| `venue_instrument_id` | Optional FK to a venue-specific listing. |
| `valid_from`, `valid_to` | Alias validity window; end must follow start. |
| `created_at`, `updated_at` | Audit instants. |

The target XOR invariant requires exactly one of `instrument_id` and `venue_instrument_id`.

## `data_sources`

Permanent provider or adapter identity without credentials.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `code`, `name` | Source identity; code is case-insensitively unique. |
| `source_type` | Constrained exchange, broker, API, webhook, file, manual, derived, or other class. |
| `provider_name` | Optional external provider label. |
| `adapter_name`, `adapter_version` | Optional ingestion implementation identity. |
| `license_ref` | Optional licensing or redistribution-policy reference. |
| `is_active`, `created_at`, `updated_at` | Lifecycle and audit instants. |

## `provenance_records`

Append-oriented metadata envelope for captured source observations.

| Column | Purpose |
| --- | --- |
| `id` | Immutable UUID primary key. |
| `source_id` | Required indexed FK to Data Source. |
| `source_namespace`, `external_record_id` | Optional provider namespace and record identity. |
| `instrument_id`, `venue_instrument_id` | Optional indexed normalized identity links. |
| `source_timestamp`, `retrieved_at` | Source occurrence and mandatory retrieval instants. |
| `adapter_name`, `adapter_version` | Adapter identity at capture time. |
| `payload_sha256` | Optional lowercase 64-character SHA-256 evidence hash. |
| `evidence_uri`, `license_ref` | Optional immutable evidence and policy references. |
| `created_at` | Internal capture-record creation instant. |

There is intentionally no `updated_at`: corrections should create new provenance records rather than rewrite source history where possible.

## Security and later ownership

RLS is enabled on all seven public tables. No `anon` or `authenticated` allow policy exists, and direct privileges for both roles are revoked. Later authenticated API stages must explicitly define and test any access they introduce.

S02.2 does not create opportunities, trades, strategies, accounts, risk, research, events, configuration, or feature flags. Later stages own those business tables: S02.3 owns configuration and feature flags; S03 owns event-ledger and data-foundation work; S04–S15 own their bounded business domains. No production-domain rows are seeded.
