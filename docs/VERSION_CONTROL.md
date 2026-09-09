# Version-Control Convention

## Branches

- `main`: production-ready history. Never deploy PROD from an ordinary development push.
- `develop`: DEV integration branch and default base for stage work.
- `stage/sXX-short-name`: one bounded stage/sub-stage change.
- `fix/short-name`: focused defect repair.
- `hotfix/short-name`: exceptional production repair after production exists and CLOUD authorizes it.

S00.1 creates `main` and `develop` locally at the same verified foundation commit. S00.2 begins from `develop`. GitHub branch protection and pull-request enforcement remain blocked until a canonical remote exists.

## Changes and merges

- Use focused conventional commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.
- Run relevant checks before every merge.
- Prefer pull requests with passing CI once GitHub is connected.
- Squash bounded stage work unless preserving separate commits materially improves auditability.
- Tags use `v0.x.y`; create `v0.1.0` only after the full S00 parent stage is accepted, not during S00.1.

## DEV/PROD safety

- Development work flows through `develop` and stage branches.
- `main` represents releasable history; it is not a scratch branch.
- Deployment is always an explicit, separately authorized operation.
- Environment-specific secrets and bindings never move through Git branches.
