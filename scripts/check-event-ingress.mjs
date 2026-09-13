import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260913053631_s03_1_event_ledger.sql", root), "utf8");
const worker = await readFile(new URL("worker/event-ingress.ts", root), "utf8");
const persistence = await readFile(new URL("worker/event-persistence.ts", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

for (const column of [
  "id", "environment", "contract_version", "event_type", "event_version", "occurred_at",
  "ingested_at", "source_id", "provenance_record_id", "external_event_id", "subject_type",
  "subject_id", "correlation_id", "causation_event_id", "request_id", "request_body_sha256", "payload",
]) requireMatch(migration, new RegExp(`\\b${column}\\b`, "i"), `Missing event_ledger column: ${column}`);

for (const contract of [
  /create\s+table\s+public\.event_ledger/i,
  /alter\s+table\s+public\.event_ledger\s+enable\s+row\s+level\s+security/i,
  /before\s+update\s+or\s+delete\s+on\s+public\.event_ledger/i,
  /before\s+truncate\s+on\s+public\.event_ledger/i,
  /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.event_ledger\s+to\s+service_role/i,
  /revoke\s+update\s*,\s*delete\s*,\s*truncate\s+on\s+table\s+public\.event_ledger\s+from\s+service_role/i,
  /request_body_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i,
]) requireMatch(migration, contract, `Missing event ledger database contract: ${contract.source}`);

if (/\bupdated_at\b/i.test(migration)) throw new Error("event_ledger must not have updated_at");
if (/create\s+policy\b/i.test(migration)) throw new Error("event_ledger must not create allow policies");

requireMatch(worker, /MAX_EVENT_BODY_BYTES/, "Ingress must enforce the body cap");
requireMatch(worker, /timingSafeEqual/, "Ingress token comparison must be timing safe");
requireMatch(worker, /request_body_sha256:\s*await\s+sha256Hex\(rawBody\)/, "Ingress must hash exact raw bytes");
requireMatch(persistence, /response\.status\s*===\s*201/, "Persistence must require a confirmed insert");
for (const binding of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EVENT_INGRESS_TOKEN"]) {
  requireMatch(persistence, new RegExp(`\\b${binding}\\b`), `Missing runtime binding: ${binding}`);
}

for (const forbidden of ["opportunities", "tradingview", "queue", "dead_letter", "retry_count"]) {
  requireMatch([migration, worker, persistence].join("\n"), new RegExp(`^(?![\\s\\S]*\\b${forbidden}\\b)`, "i"), `Forbidden later-stage scope: ${forbidden}`);
}

if (packageJson.scripts?.["check:event-ingress"] !== "node scripts/check-event-ingress.mjs") throw new Error("Missing check:event-ingress command");
if (!packageJson.scripts?.test?.includes("npm run check:event-ingress")) throw new Error("Normal tests must include event ingress checks");

console.log("S03.1 event ledger and ingress static contract passed");
