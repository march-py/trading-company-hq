import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const core = await readFile(new URL("supabase/migrations/20260913004000_s02_2_core_domain.sql", root), "utf8");
const config = await readFile(new URL("supabase/migrations/20260913030000_s02_3_config_flags_data_core.sql", root), "utf8");
const exportScript = await readFile(new URL("scripts/export-s02-data-core.mjs", root), "utf8");
const runtime = await readFile(new URL("src/data-core/configuration.ts", root), "utf8");
const seed = await readFile(new URL("supabase/seed.sql", root), "utf8");
const dictionary = await readFile(new URL("docs/s02-2-data-dictionary.md", root), "utf8");
const wrangler = await readFile(new URL("wrangler.jsonc", root), "utf8");
const gitignore = await readFile(new URL(".gitignore", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

const coreTables = ["assets", "instruments", "venues", "venue_instruments", "instrument_aliases", "data_sources", "provenance_records"];
const configTables = ["configuration_entries", "feature_flags"];
const allTables = [...coreTables, ...configTables];

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function requireFragment(value, fragment, message) {
  if (!value.includes(fragment)) throw new Error(message);
}

for (const table of coreTables) {
  requireMatch(core, new RegExp(`create\\s+table\\s+public\\.${table}\\s*\\(`, "i"), `Missing table: public.${table}`);
  requireMatch(core, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"), `Missing RLS: public.${table}`);
  requireMatch(core, new RegExp(`revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, "i"), `Missing role revoke: public.${table}`);
}

for (const table of configTables) {
  requireMatch(config, new RegExp(`create\\s+table\\s+public\\.${table}\\s*\\(`, "i"), `Missing table: public.${table}`);
  requireMatch(config, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"), `Missing RLS: public.${table}`);
  requireMatch(config, new RegExp(`revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, "i"), `Missing role revoke: public.${table}`);
}

const uuids = [core, config].join("\n").match(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/gi) ?? [];
if (uuids.length !== allTables.length) throw new Error(`Expected ${allTables.length} UUID primary keys; found ${uuids.length}`);

requireMatch(core, /\(instrument_id\s+is\s+not\s+null\)\s*<>\s*\(venue_instrument_id\s+is\s+not\s+null\)/i, "Missing alias XOR constraint");
for (const column of ["tick_size", "quantity_step", "contract_multiplier"]) {
  requireMatch(core, new RegExp(`${column}\\s+is\\s+null\\s+or\\s+${column}\\s*>\\s*0`, "i"), `Missing positive constraint: ${column}`);
}
if ((core.match(/valid_to\s+is\s+null\s+or\s+valid_to\s*>\s*valid_from/gi) ?? []).length !== 2) throw new Error("Expected two validity-window constraints");
if ((core.match(/references\s+public\.[a-z_]+\s*\(id\)\s+on\s+delete\s+restrict/gi) ?? []).length !== 11) throw new Error("Expected 11 restricted foreign keys");

for (const fragment of [
  "on public.assets (lower(code))",
  "on public.instruments (lower(canonical_code))",
  "on public.venues (lower(code))",
  "on public.data_sources (lower(code))",
  "on public.venue_instruments (venue_id, lower(market_scope), lower(symbol))\n  where valid_to is null",
  "on public.instrument_aliases (lower(namespace), lower(alias))\n  where valid_to is null",
]) requireFragment(core.toLowerCase(), fragment, `Missing unique index contract: ${fragment}`);
requireMatch(core, /payload_sha256\s+is\s+null\s+or\s+payload_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i, "Missing SHA-256 constraint");

if ((config.match(/environment\s+in\s*\(\s*'dev'\s*,\s*'prod'\s*\)/gi) ?? []).length !== 2) throw new Error("Expected two DEV/PROD environment constraints");
requireMatch(config, /value_type\s+in\s*\(\s*'boolean'\s*,\s*'number'\s*,\s*'string'\s*,\s*'json'\s*\)/i, "Missing configuration value types");
requireMatch(config, /state\s+in\s*\(\s*'disabled'\s*,\s*'shadow'\s*,\s*'enabled'\s*\)/i, "Missing feature flag states");
for (const jsonType of ["boolean", "number", "string"]) {
  requireMatch(config, new RegExp(`value_type\\s*=\\s*'${jsonType}'[\\s\\S]*?jsonb_typeof\\(value_json\\)\\s*=\\s*'${jsonType}'`, "i"), `Missing JSON type match: ${jsonType}`);
}
requireMatch(config, /value_type\s*=\s*'json'[\s\S]*?jsonb_typeof\(value_json\)\s+in\s*\(\s*'array'\s*,\s*'object'\s*\)/i, "Missing JSON object/array match");
for (const fragment of [
  "on public.configuration_entries (environment, lower(namespace), lower(key))",
  "on public.feature_flags (environment, lower(key))",
]) requireFragment(config.toLowerCase(), fragment, `Missing case-insensitive environment identity: ${fragment}`);

for (const table of [...coreTables.filter((name) => name !== "provenance_records"), ...configTables]) {
  requireMatch(config, new RegExp(`create\\s+trigger\\s+${table}_set_updated_at[\\s\\S]*?before\\s+update\\s+on\\s+public\\.${table}[\\s\\S]*?execute\\s+function\\s+public\\.set_updated_at\\(\\)`, "i"), `Missing updated_at trigger: public.${table}`);
}
requireMatch(config, /create\s+or\s+replace\s+function\s+public\.set_updated_at\(\)[\s\S]*?returns\s+trigger[\s\S]*?set\s+search_path\s*=\s*''/i, "Missing secure updated_at function");
if (/provenance_records_set_updated_at/i.test(config)) throw new Error("provenance_records must not have an updated_at trigger");
if (/create\s+policy\b/i.test([core, config].join("\n"))) throw new Error("S02 must not create allow policies");

for (const table of ["accounts", "opportunities", "trades", "trade_plans", "strategies", "experiments", "research", "events", "event_ledger", "queues", "scheduled_jobs", "risk_rules"]) {
  requireMatch(config, new RegExp(`^(?![\\s\\S]*create\\s+table\\s+(?:public\\.)?${table}\\b)`, "i"), `Forbidden later-stage table: ${table}`);
}

requireMatch(runtime, /record\.environment\s*===\s*environment/, "Runtime reads must filter explicit APP_ENV");
requireMatch(runtime, /:\s*"disabled"\s*;/, "Missing or invalid flags must resolve disabled");
requireMatch(wrangler, /"dev"[\s\S]*?"APP_ENV"\s*:\s*"dev"[\s\S]*?"prod"[\s\S]*?"APP_ENV"\s*:\s*"prod"/, "Missing DEV/PROD APP_ENV separation");

for (const table of allTables) requireFragment(exportScript, `"${table}"`, `DEV export is missing table: ${table}`);
for (const fragment of ["exported_at_utc", "environment", "accepted_git_commit", "migration_versions", "expected_tables", "row_count", "sha256"]) requireFragment(exportScript, fragment, `DEV export manifest is missing: ${fragment}`);
requireMatch(exportScript, /process\.env\.APP_ENV\s*!==\s*"dev"/, "DEV export must reject non-DEV APP_ENV");
requireFragment(gitignore, "data-core-exports/", "Generated data-core exports must be ignored");

const supabaseEntries = await readdir(new URL("supabase/", root), { recursive: true });
if (supabaseEntries.some((entry) => entry === "config.toml" || entry.endsWith("/config.toml"))) throw new Error("S02 must not add Supabase project config");

const scopedText = [core, config, seed, dictionary, exportScript, runtime].join("\n");
for (const [pattern, label] of [
  [/https?:\/\/[a-z0-9-]+\.supabase\.co/gi, "Supabase project host"],
  [/\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/g, "Supabase API key"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "JWT literal"],
]) if (pattern.test(scopedText)) throw new Error(`Forbidden ${label} found in S02 files`);

if (/^\s*(?:insert|update|delete)\b/im.test(seed)) throw new Error("S02 seed.sql must not mutate domain data");
if (packageJson.scripts?.["check:supabase-schema"] !== "node scripts/check-supabase-schema.mjs") throw new Error("Missing check:supabase-schema command");
if (!packageJson.scripts?.test?.includes("npm run check:supabase-schema")) throw new Error("Normal tests must include schema checks");
if (packageJson.scripts?.["export:data-core:dev"] !== "APP_ENV=dev node scripts/export-s02-data-core.mjs") throw new Error("Missing DEV export command");

console.log(`S02.2-S02.3 schema contract passed for ${allTables.length} tables`);
