import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const expectedTables = [
  "assets",
  "instruments",
  "venues",
  "venue_instruments",
  "instrument_aliases",
  "data_sources",
  "provenance_records",
  "configuration_entries",
  "feature_flags",
];

if (process.env.APP_ENV !== "dev") {
  throw new Error("S02 data-core exports are DEV-only; set APP_ENV=dev");
}

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required and must identify the DEV database");
}

if (!/^[0-9a-f]{40}$/.test(process.env.ACCEPTED_GIT_COMMIT ?? "")) {
  throw new Error("ACCEPTED_GIT_COMMIT must be the 40-character accepted commit SHA");
}

const databaseUrl = new URL(process.env.SUPABASE_DB_URL);
if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
  throw new Error("SUPABASE_DB_URL must be a PostgreSQL connection URL");
}
const databaseEnvironment = {
  ...process.env,
  PGHOST: databaseUrl.hostname,
  PGPORT: databaseUrl.port || "5432",
  PGDATABASE: databaseUrl.pathname.slice(1),
  PGUSER: decodeURIComponent(databaseUrl.username),
  PGPASSWORD: decodeURIComponent(databaseUrl.password),
  PGSSLMODE: databaseUrl.searchParams.get("sslmode") ?? "require",
};
delete databaseEnvironment.SUPABASE_DB_URL;

const exportTime = new Date().toISOString();
const directory = resolve("data-core-exports", exportTime.replaceAll(":", "-"));
await mkdir(directory, { recursive: true });

const files = [];
for (const table of expectedTables) {
  const query = `copy (select row_to_json(t) from public.${table} t order by id) to stdout`;
  const data = execFileSync("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--command", query], {
    encoding: "utf8",
    env: databaseEnvironment,
    maxBuffer: 50 * 1024 * 1024,
  });
  const rows = data.split("\n").filter(Boolean);
  const contents = rows.length ? `${rows.join("\n")}\n` : "";
  const filename = `${table}.jsonl`;
  await writeFile(resolve(directory, filename), contents, { mode: 0o600 });
  files.push({
    table,
    filename,
    row_count: rows.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}

const migrationVersions = execFileSync("psql", [
  "--no-psqlrc",
  "--tuples-only",
  "--no-align",
  "--command",
  "select version from supabase_migrations.schema_migrations order by version",
], { encoding: "utf8", env: databaseEnvironment }).split("\n").map((value) => value.trim()).filter(Boolean);

const manifest = {
  exported_at_utc: exportTime,
  environment: "dev",
  accepted_git_commit: process.env.ACCEPTED_GIT_COMMIT,
  migration_versions: migrationVersions,
  expected_tables: expectedTables,
  files,
};
await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote DEV S02 data-core export to ${directory}`);
