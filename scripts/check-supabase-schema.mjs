import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationPath = "supabase/migrations/20260913004000_s02_2_core_domain.sql";
const migration = await readFile(new URL(migrationPath, root), "utf8");
const seed = await readFile(new URL("supabase/seed.sql", root), "utf8");
const dictionary = await readFile(new URL("docs/s02-2-data-dictionary.md", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

const tables = [
  "assets",
  "instruments",
  "venues",
  "venue_instruments",
  "instrument_aliases",
  "data_sources",
  "provenance_records",
];

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function requireFragment(value, fragment, message) {
  if (!value.includes(fragment)) throw new Error(message);
}

for (const table of tables) {
  requireMatch(
    migration,
    new RegExp(`create\\s+table\\s+public\\.${table}\\s*\\(`, "i"),
    `Missing table declaration: public.${table}`,
  );
  requireMatch(
    migration,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`, "i"),
    `Missing RLS enablement: public.${table}`,
  );
  requireMatch(
    migration,
    new RegExp(`revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated\\s*;`, "i"),
    `Missing anon/authenticated privilege revoke: public.${table}`,
  );
}

const uuidPrimaryKeys = migration.match(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/gi) ?? [];
if (uuidPrimaryKeys.length !== tables.length) {
  throw new Error(`Expected ${tables.length} UUID primary-key defaults; found ${uuidPrimaryKeys.length}`);
}

const timestamptzColumns = migration.match(/\btimestamptz\b/gi) ?? [];
if (timestamptzColumns.length < 14) {
  throw new Error(`Authoritative instants are not consistently stored as timestamptz; found ${timestamptzColumns.length}`);
}

if (/create\s+policy\b/i.test(migration)) {
  throw new Error("S02.2 must not introduce any anon/authenticated allow policy");
}

requireMatch(
  migration,
  /\(instrument_id\s+is\s+not\s+null\)\s*<>\s*\(venue_instrument_id\s+is\s+not\s+null\)/i,
  "Instrument alias target XOR constraint is missing",
);

for (const column of ["tick_size", "quantity_step", "contract_multiplier"]) {
  requireMatch(
    migration,
    new RegExp(`${column}\\s+is\\s+null\\s+or\\s+${column}\\s*>\\s*0`, "i"),
    `Positive numeric constraint is missing for ${column}`,
  );
}

const validityChecks = migration.match(/valid_to\s+is\s+null\s+or\s+valid_to\s*>\s*valid_from/gi) ?? [];
if (validityChecks.length !== 2) {
  throw new Error(`Expected two validity-window constraints; found ${validityChecks.length}`);
}

const restrictForeignKeys = migration.match(/references\s+public\.[a-z_]+\s*\(id\)\s+on\s+delete\s+restrict/gi) ?? [];
if (restrictForeignKeys.length !== 11) {
  throw new Error(`Expected 11 ON DELETE RESTRICT foreign keys; found ${restrictForeignKeys.length}`);
}

const requiredIndexFragments = [
  "on public.assets (lower(code))",
  "on public.instruments (lower(canonical_code))",
  "on public.venues (lower(code))",
  "on public.data_sources (lower(code))",
  "on public.venue_instruments (venue_id, lower(market_scope), lower(symbol))\n  where valid_to is null",
  "on public.instrument_aliases (lower(namespace), lower(alias))\n  where valid_to is null",
];

for (const fragment of requiredIndexFragments) {
  requireFragment(migration.toLowerCase(), fragment, `Missing required unique index contract: ${fragment}`);
}

requireMatch(
  migration,
  /payload_sha256\s+is\s+null\s+or\s+payload_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i,
  "Lowercase SHA-256 provenance constraint is missing",
);

const forbiddenTables = [
  "accounts",
  "opportunities",
  "trades",
  "trade_plans",
  "strategies",
  "experiments",
  "research",
  "events",
  "feature_flags",
  "configuration",
];

for (const table of forbiddenTables) {
  requireMatch(
    migration,
    new RegExp(`^(?![\\s\\S]*create\\s+table\\s+(?:public\\.)?${table}\\b)`, "i"),
    `Forbidden later-stage table introduced: ${table}`,
  );
}

const supabaseEntries = await readdir(new URL("supabase/", root), { recursive: true });
if (supabaseEntries.some((entry) => entry === "config.toml" || entry.endsWith("/config.toml"))) {
  throw new Error("S02.2 must not add Supabase project configuration or feature flags");
}

const scopedText = [migration, seed, dictionary].join("\n");
const forbiddenSecretPatterns = [
  [/https?:\/\/[a-z0-9-]+\.supabase\.co/gi, "Supabase project host"],
  [/\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/g, "Supabase API key"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "JWT literal"],
  [/(?:project[_ -]?ref|password|api[_ -]?key|service[_ -]?role)\s*[:=]\s*['"]?[A-Za-z0-9_-]{8,}/gi, "credential assignment"],
];

for (const [pattern, label] of forbiddenSecretPatterns) {
  if (pattern.test(scopedText)) throw new Error(`Forbidden ${label} found in S02.2 files`);
}

if (/^\s*(?:insert|update|delete)\b/im.test(seed)) {
  throw new Error("S02.2 seed.sql must not mutate production-domain data");
}

if (packageJson.scripts?.["check:supabase-schema"] !== "node scripts/check-supabase-schema.mjs") {
  throw new Error("package.json is missing the canonical check:supabase-schema command");
}

if (!packageJson.scripts?.test?.includes("npm run check:supabase-schema")) {
  throw new Error("The normal test chain does not include check:supabase-schema");
}

console.log(`S02.2 Supabase schema contract passed for ${tables.length} tables`);
