import {
  readFile,
} from "node:fs/promises";

const root =
  new URL("../", import.meta.url);

const read = (path) =>
  readFile(
    new URL(path, root),
    "utf8",
  );

const [
  migration,
  wrangler,
  worker,
  registry,
  adapter,
] = await Promise.all([
  read(
    "supabase/migrations/20260914035000_s03_3_automation_health.sql",
  ),
  read("wrangler.jsonc"),
  read("worker/index.ts"),
  read(
    "worker/scheduled-registry.ts",
  ),
  read(
    "worker/provider-adapter.ts",
  ),
]);

function requireMatch(
  text,
  pattern,
  message,
) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

function forbidMatch(
  text,
  pattern,
  message,
) {
  if (pattern.test(text)) {
    throw new Error(message);
  }
}

requireMatch(
  migration,
  /create table public\.automation_runs/i,
  "automation_runs table missing",
);

requireMatch(
  migration,
  /unique\s*\(\s*environment\s*,\s*job_key\s*,\s*scheduled_for\s*\)/i,
  "scheduled run uniqueness missing",
);

requireMatch(
  migration,
  /automation_runs_metadata_size_check[\s\S]*pg_column_size\(metadata\)\s*<=\s*16384/i,
  "automation_runs metadata size bound missing",
);

requireMatch(
  migration,
  /alter table public\.automation_runs enable row level security/i,
  "automation_runs RLS missing",
);

requireMatch(
  migration,
  /grant select,\s*insert,\s*update[\s\S]*automation_runs[\s\S]*service_role/i,
  "automation_runs service_role grant missing",
);

requireMatch(
  migration,
  /create table public\.automation_heartbeats/i,
  "automation_heartbeats table missing",
);

requireMatch(
  migration,
  /automation_heartbeats_metadata_size_check[\s\S]*pg_column_size\(metadata\)\s*<=\s*16384/i,
  "heartbeat metadata size bound missing",
);

requireMatch(
  migration,
  /automation_heartbeats_reject_update_delete/i,
  "heartbeat update/delete rejection missing",
);

requireMatch(
  migration,
  /automation_heartbeats_reject_truncate/i,
  "heartbeat truncate rejection missing",
);

requireMatch(
  migration,
  /alter table public\.automation_heartbeats enable row level security/i,
  "automation_heartbeats RLS missing",
);

requireMatch(
  wrangler,
  /"dev"[\s\S]*"crons"\s*:\s*\[\s*"\*\/15 \* \* \* \*"\s*\]/,
  "DEV cron declaration missing",
);

requireMatch(
  wrangler,
  /"prod"[\s\S]*"crons"\s*:\s*\[\s*"\*\/15 \* \* \* \*"\s*\]/,
  "reserved PROD cron declaration missing",
);

requireMatch(
  wrangler,
  /trading-company-events-dev/,
  "existing DEV queue config missing",
);

requireMatch(
  wrangler,
  /trading-company-events-dlq-dev/,
  "existing DEV DLQ config missing",
);

requireMatch(
  worker,
  /async scheduled\s*\(/,
  "Worker scheduled handler missing",
);

requireMatch(
  worker,
  /\/api\/health\/automation/,
  "automation health API missing",
);

requireMatch(
  registry,
  /SYSTEM_HEARTBEAT_CRON[\s\S]*"\*\/15 \* \* \* \*"/,
  "system heartbeat registry cron missing",
);

requireMatch(
  registry,
  /return null/,
  "unknown cron must fail closed",
);

requireMatch(
  adapter,
  /healthCheck\(/,
  "provider adapter healthCheck contract missing",
);

requireMatch(
  adapter,
  /execute\(/,
  "provider adapter execute contract missing",
);

forbidMatch(
  migration
    + wrangler
    + worker
    + registry
    + adapter,
  /\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/,
  "Supabase credential literal found",
);

forbidMatch(
  migration
    + wrangler
    + worker
    + registry
    + adapter,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  "JWT literal found",
);

console.log(
  "S03.3 automation architecture static contract passed",
);
