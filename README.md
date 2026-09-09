# Trading Company HQ

Private React and Cloudflare Worker application foundation for the Trading Company operating system.

## Local development

1. Use the Node version in `.nvmrc`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://127.0.0.1:5173`.

The page calls `GET /api/health` through the local Worker runtime. No secrets are required for S00.2.

## Verification

- `npm run check` regenerates Worker binding types and runs typecheck, lint, tests, and DEV/PROD builds.
- `npm run dev` starts the local integrated app and Worker.
- Deployment is intentionally excluded from S00.2.

See [the S00.2 environment record](docs/S00.2-LOCAL-APP-ENVIRONMENT.md) for environment and secrets rules.

Private, cloud-first operating system for trading research, operations, risk, performance, automation, and knowledge.

## Current status

S00.2 local application foundation on `stage/s00-local-app`. The repository contains no trading logic, deployment, operational schema, credentials, or cloud access policy.

The accepted technical direction is now runnable as a React/Vite client with a Cloudflare Worker API. S00.3 owns Cloud DEV deployment, Cloudflare Access configuration, and CI validation.

## Stable names

- Repository: `trading-company-hq`
- Cloudflare base Worker: `trading-company-hq`
- DEV Worker: `trading-company-hq-dev`
- PROD Worker: `trading-company-hq-prod`

## Test

```sh
npm test
```

This runs the S00.1 directory/hygiene baseline and the S00.2 Worker tests. See `docs/REPOSITORY_STRUCTURE.md`, `docs/VERSION_CONTROL.md`, and `docs/STAGE_ARTIFACTS.md`.
