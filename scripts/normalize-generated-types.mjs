import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../worker-configuration.d.ts", import.meta.url);
const generated = await readFile(path, "utf8");
const normalized = generated.replace(/[ \t]+$/gm, "");

if (generated !== normalized) await writeFile(path, normalized);
