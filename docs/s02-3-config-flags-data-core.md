# S02.3 Config, Flags, and Data-Core Validation

## Boundary

S02.3 adds environment-scoped configuration entries, feature flags, automatic `updated_at` maintenance, and a DEV-only data-core export path. It does not add product APIs, market-data adapters, jobs, queues, trading entities, production deployment, or automated trading behavior.

## Configuration contract

- `configuration_entries` is keyed by `(environment, lower(namespace), lower(key))`.
- `environment` is exactly `dev` or `prod`; callers must always select one explicitly.
- Namespace and key are lowercase machine identifiers beginning with a letter and continuing with letters, digits, or underscores.
- `value_type` is `boolean`, `number`, `string`, or `json`. Scalar types must match `jsonb_typeof(value_json)`; `json` stores an object or array.
- DEV and PROD may hold the same logical key. Cross-environment fallback is forbidden.

## Feature-flag contract

- `feature_flags` is keyed by `(environment, lower(key))`.
- State is exactly `disabled`, `shadow`, or `enabled` and defaults to `disabled`.
- Missing or invalid runtime records resolve to `disabled`. `shadow` is observation-only and must not enable product behavior.

## Mutation and security

One `public.set_updated_at()` trigger function maintains `updated_at` on the six mutable S02.2 domain tables and both S02.3 tables. `provenance_records` remains append-oriented and has no `updated_at` column or trigger.

RLS is enabled on both new tables. No allow policies are created, and all table privileges are revoked from `anon` and `authenticated`.

## DEV export baseline

Run `npm run export:data-core:dev` with `SUPABASE_DB_URL` set to the DEV PostgreSQL connection URL and `ACCEPTED_GIT_COMMIT` set to the accepted 40-character commit SHA. The command requires `psql`, refuses non-DEV `APP_ENV`, and writes a private, ignored directory under `data-core-exports/`.

The export contains JSON Lines for all nine S02 tables plus a manifest with UTC export time, environment, accepted Git commit, applied migration versions, the expected table list, row counts, and SHA-256 file checksums. Export files and credentials must never be committed. Full production backup and restore remains S15 scope.
