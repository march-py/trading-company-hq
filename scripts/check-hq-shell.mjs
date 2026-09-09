import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const requiredFiles = [
  "src/components/layout/AppShell.tsx",
  "src/components/layout/PageScaffold.tsx",
  "src/components/layout/Sidebar.tsx",
  "src/components/layout/Surfaces.tsx",
  "src/components/layout/index.ts",
];

for (const file of requiredFiles) await access(new URL(file, root));

const sources = {
  app: await readFile(new URL("src/App.tsx", root), "utf8"),
  styles: await readFile(new URL("src/styles.css", root), "utf8"),
  sidebar: await readFile(new URL("src/components/layout/Sidebar.tsx", root), "utf8"),
  surfaces: await readFile(new URL("src/components/layout/Surfaces.tsx", root), "utf8"),
};

for (const marker of ["AppShell", "PageScaffold", "PanelShell", "CardShell", "TableShell", "Lobby", "S03", "S18"]) {
  if (!Object.values(sources).some((contents) => contents.includes(marker))) {
    throw new Error(`Missing HQ shell contract marker: ${marker}`);
  }
}

for (const selector of [".app-frame", ".sidebar", ".content-region", ".nav-item--active", ".module-grid", ".shell-table-row"]) {
  if (!sources.styles.includes(selector)) throw new Error(`Missing HQ shell selector: ${selector}`);
}

if (!sources.sidebar.includes('aria-current={active ? "page" : undefined}')) {
  throw new Error("Active navigation does not expose aria-current");
}

if (!sources.sidebar.includes("disabled={!available}")) {
  throw new Error("Planned navigation insertion points are not safely disabled");
}

for (const excluded of ["command palette", "instrument drawer", "@media (max-width"]) {
  if (Object.values(sources).some((contents) => contents.toLowerCase().includes(excluded))) {
    throw new Error(`Later-stage scope marker found in S01.2 implementation: ${excluded}`);
  }
}

console.log("S01.2 HQ shell check passed");
