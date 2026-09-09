import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const requiredDirectories = ["config", "docs", "public", "scripts", "src", "test", "worker"];
const requiredFiles = [
  ".editorconfig",
  ".gitignore",
  ".nvmrc",
  "AGENTS.md",
  "README.md",
  "package.json",
  "docs/REPOSITORY_STRUCTURE.md",
  "docs/STAGE_ARTIFACTS.md",
  "docs/TOOLCHAIN.md",
  "docs/VERSION_CONTROL.md"
];

for (const directory of requiredDirectories) {
  await access(new URL(`${directory}/`, root));
}

for (const file of requiredFiles) {
  await access(new URL(file, root));
}

const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (packageJson.name !== "trading-company-hq" || packageJson.private !== true) {
  throw new Error("package identity or private flag is incorrect");
}

const gitignore = await readFile(new URL(".gitignore", root), "utf8");
for (const pattern of [".env*", ".dev.vars*", "node_modules/", "dist/"]) {
  if (!gitignore.includes(pattern)) {
    throw new Error(`missing required ignore pattern: ${pattern}`);
  }
}

console.log(`S00.1 foundation check passed at ${join(root.pathname)}`);
