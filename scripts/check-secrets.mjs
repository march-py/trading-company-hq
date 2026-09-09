import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk_live_[A-Za-z0-9]{20,}/,
  /(?:CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/,
];

const listed = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "buffer" },
);

if (listed.status !== 0) {
  throw new Error("Unable to list tracked files for secret scanning");
}

const paths = listed.stdout.toString("utf8").split("\0").filter(Boolean);
const findings = [];

for (const path of paths) {
  const contents = await readFile(path, "utf8");
  for (const pattern of patterns) {
    if (pattern.test(contents)) findings.push(`${path}: ${pattern.source}`);
  }
}

if (findings.length > 0) {
  throw new Error(`Potential credential material found:\n${findings.join("\n")}`);
}

console.log(`Secret scan passed for ${paths.length} tracked and untracked files.`);
