# Repository Instructions

## Authority and scope

- Cloud Google Drive `Trading Company / Trading Company Builder` is project-control truth.
- This local repository becomes source-code truth until a canonical GitHub remote is connected and verified.
- Respect the active SXX.X boundary. Do not begin a later sub-stage early.
- Preserve accepted architecture unless a real blocker is documented and escalated to CLOUD.

## Safety

- Never commit secrets, tokens, credentials, account exports, or production data.
- Keep DEV and PROD configuration, bindings, secrets, and deployment paths separate.
- Do not deploy, publish, purchase, trade, or broaden permissions without explicit authority.
- Trading Company V1 never executes trades automatically.

## Change discipline

- Work from `develop` using `stage/sXX-short-name` or `fix/short-name` branches.
- Keep commits bounded and run relevant checks before merge.
- Record meaningful build evidence and handoffs in the canonical Drive Builder folders.
