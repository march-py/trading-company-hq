# Trading Company HQ

Private, cloud-first operating system for trading research, operations, risk, performance, automation, and knowledge.

## Current status

S00.1 repository foundation only. This repository intentionally contains no application implementation, trading logic, deployment, operational schema, credentials, or production configuration yet.

The accepted technical direction is a TypeScript repository with a React/Vite client and a Cloudflare Worker API. S00.2 owns the minimal runnable application and environment/secrets workflow. S00.3 owns Cloud DEV deployment and CI validation.

## Stable names

- Repository: `trading-company-hq`
- Cloudflare base Worker: `trading-company-hq`
- DEV Worker: `trading-company-hq-dev`
- PROD Worker: `trading-company-hq-prod`

## Foundation check

```sh
npm test
```

This dependency-free check validates the S00.1 directory and hygiene baseline. See `docs/REPOSITORY_STRUCTURE.md`, `docs/VERSION_CONTROL.md`, and `docs/STAGE_ARTIFACTS.md`.
