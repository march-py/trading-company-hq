import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const requiredFiles = [
  "src/components/states/StatePanel.tsx",
  "src/components/overlays/CommandPalette.tsx",
  "src/components/overlays/InstrumentDrawer.tsx",
];
for (const file of requiredFiles) await access(new URL(file, root));

const sources = {
  app: await readFile(new URL("src/App.tsx", root), "utf8"),
  styles: await readFile(new URL("src/styles.css", root), "utf8"),
  tokens: await readFile(new URL("src/design-tokens.css", root), "utf8"),
  state: await readFile(new URL("src/components/states/StatePanel.tsx", root), "utf8"),
  palette: await readFile(new URL("src/components/overlays/CommandPalette.tsx", root), "utf8"),
  drawer: await readFile(new URL("src/components/overlays/InstrumentDrawer.tsx", root), "utf8"),
};

for (const state of ['"loading"', '"error"', '"empty"']) {
  if (!sources.state.includes(state)) throw new Error(`Missing reusable state: ${state}`);
}

for (const marker of ["CommandPalette", "InstrumentDrawer", "metaKey", "ctrlKey", "Escape", "aria-modal=\"true\""]) {
  if (!Object.values(sources).some((contents) => contents.includes(marker))) throw new Error(`Missing interaction foundation: ${marker}`);
}

for (const marker of ["@media (max-width: 900px)", "@media (max-width: 600px)", "overflow-x: auto", "prefers-reduced-motion: reduce"]) {
  if (!Object.values(sources).some((contents) => contents.includes(marker))) throw new Error(`Missing responsive or motion rule: ${marker}`);
}

for (const excluded of ["supabase", "tradingview", "broker api", "exchange api"]) {
  if (Object.values(sources).some((contents) => contents.toLowerCase().includes(excluded))) throw new Error(`Later-stage integration marker found: ${excluded}`);
}

console.log("S01.3 state, responsive, and interaction foundation check passed");
