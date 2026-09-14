import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const migration = await readFile(
  new URL(
    "supabase/migrations/20260914032000_s03_2_queue_idempotency.sql",
    root,
  ),
  "utf8",
);

const previousMigration = await readFile(
  new URL(
    "supabase/migrations/20260913053631_s03_1_event_ledger.sql",
    root,
  ),
  "utf8",
);

const wrangler = await readFile(
  new URL("wrangler.jsonc", root),
  "utf8",
);

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function forbidMatch(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

if (!migration.endsWith("\n")) {
  throw new Error("Migration must end with a newline");
}

if (migration.split("\n").some((line) => /[ \t]+$/.test(line))) {
  throw new Error("Migration contains trailing whitespace");
}

requireMatch(
  migration,
  /alter\s+table\s+public\.event_ledger[\s\S]*?add\s+column\s+idempotency_key_sha256\s+text/i,
  "Missing event_ledger idempotency hash column",
);

requireMatch(
  migration,
  /idempotency_key_sha256\s+is\s+null[\s\S]*?idempotency_key_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i,
  "Missing nullable lowercase SHA-256 constraint",
);

requireMatch(
  migration,
  /create\s+unique\s+index\s+event_ledger_environment_idempotency_key_uidx[\s\S]*?on\s+public\.event_ledger\s*\(\s*environment\s*,\s*idempotency_key_sha256\s*\)[\s\S]*?where\s+idempotency_key_sha256\s+is\s+not\s+null/i,
  "Missing partial environment/idempotency unique index",
);

requireMatch(
  migration,
  /create\s+table\s+public\.event_processing_receipts\s*\(/i,
  "Missing event_processing_receipts table",
);

requireMatch(
  migration,
  /event_id\s+uuid\s+primary\s+key[\s\S]*?references\s+public\.event_ledger\s*\(id\)\s+on\s+delete\s+restrict/i,
  "Processing receipt must use event_id as restricted ledger FK",
);

requireMatch(
  migration,
  /status\s+in\s*\(\s*'processing'\s*,\s*'succeeded'\s*\)/i,
  "Missing bounded processing receipt states",
);

requireMatch(
  migration,
  /attempt_count\s*>=\s*0/i,
  "Missing non-negative processing attempt constraint",
);

requireMatch(
  migration,
  /alter\s+table\s+public\.event_processing_receipts\s+enable\s+row\s+level\s+security/i,
  "Processing receipts must enable RLS",
);

requireMatch(
  migration,
  /revoke\s+all\s+privileges\s+on\s+table\s+public\.event_processing_receipts\s+from\s+anon\s*,\s*authenticated/i,
  "Processing receipts must revoke anon/authenticated privileges",
);

requireMatch(
  migration,
  /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.event_processing_receipts\s+to\s+service_role/i,
  "Processing receipts require bounded service_role privileges",
);

requireMatch(
  migration,
  /create\s+table\s+public\.event_dead_letters\s*\(/i,
  "Missing event_dead_letters table",
);

requireMatch(
  migration,
  /id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i,
  "Dead letters require generated UUID identity",
);

requireMatch(
  migration,
  /event_id\s+uuid[\s\S]*?references\s+public\.event_ledger\s*\(id\)\s+on\s+delete\s+restrict/i,
  "Dead letter event_id must reference immutable ledger",
);

requireMatch(
  migration,
  /jsonb_typeof\s*\(\s*payload\s*\)\s*=\s*'object'/i,
  "Dead letter payload must be object-only",
);

requireMatch(
  migration,
  /pg_column_size\s*\(\s*payload\s*\)\s*<=\s*32768/i,
  "Dead letter payload must be bounded",
);

requireMatch(
  migration,
  /create\s+unique\s+index\s+event_dead_letters_queue_message_id_uidx/i,
  "Missing dead-letter queue message uniqueness",
);

requireMatch(
  migration,
  /create\s+trigger\s+event_dead_letters_reject_update_delete[\s\S]*?before\s+update\s+or\s+delete\s+on\s+public\.event_dead_letters/i,
  "Missing dead-letter UPDATE/DELETE protection",
);

requireMatch(
  migration,
  /create\s+trigger\s+event_dead_letters_reject_truncate[\s\S]*?before\s+truncate\s+on\s+public\.event_dead_letters/i,
  "Missing dead-letter TRUNCATE protection",
);

requireMatch(
  migration,
  /alter\s+table\s+public\.event_dead_letters\s+enable\s+row\s+level\s+security/i,
  "Dead letters must enable RLS",
);

requireMatch(
  migration,
  /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.event_dead_letters\s+to\s+service_role/i,
  "Dead letters require select/insert-only service_role access",
);

requireMatch(
  previousMigration,
  /event_ledger_reject_update_delete/i,
  "S03.1 event ledger mutation protection is missing",
);

forbidMatch(
  migration,
  /create\s+policy\b/i,
  "S03.2 must not create public RLS allow policies",
);

forbidMatch(
  migration,
  /\bdrop\s+(?:table|column|constraint|trigger)\b/i,
  "S03.2 migration must not drop existing database protections",
);

forbidMatch(
  migration,
  /alter\s+table\s+public\.event_ledger\s+disable\s+row\s+level\s+security/i,
  "S03.2 must not disable event_ledger RLS",
);

forbidMatch(
  migration,
  /\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/i,
  "Supabase credential literal found",
);

forbidMatch(
  migration,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  "JWT literal found",
);

requireMatch(
  wrangler,
  /"dev"[\s\S]*?"binding"\s*:\s*"EVENT_QUEUE"[\s\S]*?"queue"\s*:\s*"trading-company-events-dev"/i,
  "Missing DEV EVENT_QUEUE producer binding",
);

requireMatch(
  wrangler,
  /"queue"\s*:\s*"trading-company-events-dev"[\s\S]*?"max_retries"\s*:\s*3[\s\S]*?"dead_letter_queue"\s*:\s*"trading-company-events-dlq-dev"[\s\S]*?"retry_delay"\s*:\s*30/i,
  "Missing DEV main queue retry/DLQ contract",
);

requireMatch(
  wrangler,
  /"queue"\s*:\s*"trading-company-events-dlq-dev"/i,
  "Missing DEV DLQ consumer declaration",
);

requireMatch(
  wrangler,
  /"prod"[\s\S]*?"binding"\s*:\s*"EVENT_QUEUE"[\s\S]*?"queue"\s*:\s*"trading-company-events-prod"/i,
  "Missing reserved PROD EVENT_QUEUE declaration",
);

requireMatch(
  wrangler,
  /"queue"\s*:\s*"trading-company-events-prod"[\s\S]*?"max_retries"\s*:\s*3[\s\S]*?"dead_letter_queue"\s*:\s*"trading-company-events-dlq-prod"[\s\S]*?"retry_delay"\s*:\s*30/i,
  "Missing reserved PROD retry/DLQ declaration",
);

requireMatch(
  wrangler,
  /"queue"\s*:\s*"trading-company-events-dlq-prod"/i,
  "Missing reserved PROD DLQ declaration",
);

console.log("S03.2 migration and queue config static contract passed");
