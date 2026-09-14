import {
  readFile,
  readdir,
} from "node:fs/promises";

const root = new URL(
  "../",
  import.meta.url,
);

const migrationDir = new URL(
  "supabase/migrations/",
  root,
);

const migrationFiles = (
  await readdir(migrationDir)
)
  .filter((name) =>
    name.endsWith(
      "_s04_2_opportunity_lifecycle.sql",
    )
  )
  .sort();

const migrationFile =
  migrationFiles.at(-1);

if (!migrationFile) {
  throw new Error(
    "S04.2 opportunity lifecycle migration missing",
  );
}

const sql = await readFile(
  new URL(
    migrationFile,
    migrationDir,
  ),
  "utf8",
);

function requireMatch(
  pattern,
  message,
) {
  if (!pattern.test(sql)) {
    throw new Error(message);
  }
}

requireMatch(
  /create table public\.opportunities/,
  "opportunities table missing",
);

requireMatch(
  /create table public\.opportunity_transitions/,
  "opportunity transition history missing",
);

requireMatch(
  /opportunities_environment_source_event_uidx/,
  "one-opportunity-per-source-event protection missing",
);

requireMatch(
  /opportunities_environment_dedupe_uidx/,
  "opportunity dedupe protection missing",
);

requireMatch(
  /tradingview_deep_link/,
  "TradingView deep-link support missing",
);

for (const state of [
  "detected",
  "qualified",
  "alerted",
  "seen",
]) {
  requireMatch(
    new RegExp(`'${state}'`),
    `lifecycle state missing: ${state}`,
  );
}

requireMatch(
  /old\.status\s*=\s*'detected'[\s\S]*new\.status\s*=\s*'qualified'/,
  "DETECTED -> QUALIFIED transition missing",
);

requireMatch(
  /old\.status\s*=\s*'qualified'[\s\S]*new\.status\s*=\s*'alerted'/,
  "QUALIFIED -> ALERTED transition missing",
);

requireMatch(
  /old\.status\s*=\s*'alerted'[\s\S]*new\.status\s*=\s*'seen'/,
  "ALERTED -> SEEN transition missing",
);

requireMatch(
  /invalid opportunity lifecycle transition/,
  "invalid transition rejection missing",
);

requireMatch(
  /opportunity_transitions is append-only/,
  "append-only transition history missing",
);

requireMatch(
  /alter table public\.opportunities enable row level security/,
  "opportunities RLS missing",
);

requireMatch(
  /alter table public\.opportunity_transitions enable row level security/,
  "transition-history RLS missing",
);

requireMatch(
  /revoke all privileges on table public\.opportunities[\s\S]*from anon, authenticated/,
  "public opportunity access denial missing",
);

requireMatch(
  /revoke all privileges on table public\.opportunity_transitions[\s\S]*from anon, authenticated/,
  "public transition access denial missing",
);

console.log(
  "S04.2 opportunity lifecycle static contract passed",
);

console.log(
  `Migration: ${migrationFile}`,
);
