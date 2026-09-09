# S00 Toolchain Baseline

Verified on the Local Mac during the pre-build audit:

- macOS 26.6.2 on arm64
- Apple Git 2.50.1
- Node.js 24.20.0
- npm 11.19.0
- Python 3.14.7
- SQLite 3.51.0

Repository package manager: npm. The accepted interim S00 artifact already uses `package-lock.json`, and npm is bundled with the selected Node 24 runtime. Do not mix npm and pnpm lockfiles.

S00.1 installs no dependencies. S00.2 may add the approved React, Vite, TypeScript, test, and Cloudflare Worker dependencies with a committed npm lockfile, then must mechanically verify a clean install and local run.

Currently absent local tools that may be provisioned only when their owning stage requires them: standalone Wrangler, Supabase CLI, Cloudflared, Docker, PostgreSQL CLI, DuckDB CLI, and the Python analytical stack.
