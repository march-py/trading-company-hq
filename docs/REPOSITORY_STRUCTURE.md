# Repository Structure

The repository stays a single TypeScript project during S00. The layout preserves the accepted React/Vite plus Cloudflare Worker direction without implementing S00.2 early.

| Path | Permanent responsibility | First owning stage |
| --- | --- | --- |
| `src/` | React client and shared client-side application code | S00.2 |
| `worker/` | Cloudflare Worker API entrypoint and cloud-edge code | S00.2/S00.3 |
| `test/` | Automated unit, integration, contract, and regression tests | S00 onward |
| `public/` | Version-controlled static public assets | S00.2 onward |
| `config/` | Non-secret examples and deterministic configuration metadata | S00.2 onward |
| `scripts/` | Reproducible maintenance, validation, research, and build scripts | S00 onward |
| `docs/` | Repository-local engineering decisions and operating instructions | S00 onward |
| `.github/` | GitHub collaboration and CI configuration after remote connection | S00.1/S00.3 |

Large datasets, generated research assets, build output, credentials, and canonical project-control records do not belong in Git. Drive holds human-readable project-control evidence; R2/Parquet later holds bulk analytical artifacts; Supabase later holds structured operational records.
