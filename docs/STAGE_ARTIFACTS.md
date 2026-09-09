# Stage Artifact Convention

## Repository

- Source, tests, deterministic configuration examples, scripts, and engineering documentation live in Git.
- Stage work uses the branch name `stage/sXX-short-name` and bounded commits.
- Generated build output, temporary logs, coverage, caches, credentials, and large datasets remain untracked.

## Google Drive Builder

- `01_STAGE_HANDOFFS`: self-contained continuation record for every completed sub-stage.
- `02_STAGE_OUTPUTS/SXX_*`: durable stage-specific exports and deliverables that should not live in Git.
- `03_BUILD_JOURNAL`: meaningful chronological progress and decisions.
- `04_ERRORS_INCIDENTS`: significant failures, causes, fixes, and unresolved risks.
- `05_TESTING_VALIDATION`: mechanical validation evidence.
- `06_ARCHITECTURE_SPECS`: accepted cross-stage architecture and contracts.
- `07_REPORTS`: parent-stage completion and audit reports.
- `90_LIVE_CHAT`: delegated requests and results only; not authoritative state.

Artifacts use stable stage-prefixed names. Nothing important may exist only in chat text.
