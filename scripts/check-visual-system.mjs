import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const files = {
  tokens: await readFile(new URL("src/design-tokens.css", root), "utf8"),
  styles: await readFile(new URL("src/styles.css", root), "utf8"),
  app: await readFile(new URL("src/App.tsx", root), "utf8"),
  icon: await readFile(new URL("src/components/Icon.tsx", root), "utf8"),
  status: await readFile(new URL("src/components/StatusBadge.tsx", root), "utf8"),
};

const requiredTokens = [
  "--color-canvas",
  "--color-surface-1",
  "--color-text-primary",
  "--color-positive",
  "--color-negative",
  "--color-focus",
  "--space-4",
  "--radius-md",
  "--shadow-focus",
  "--control-md",
];

for (const token of requiredTokens) {
  if (!files.tokens.includes(token) && !Object.values(files).some((contents) => contents.includes(token))) {
    throw new Error(`Missing visual-system token: ${token}`);
  }
}

for (const tone of ["normal", "active", "success", "warning", "error", "disabled", "unknown"]) {
  if (!files.status.includes(`${tone}:`) || !files.styles.includes(`status-badge--${tone}`)) {
    throw new Error(`Missing status treatment: ${tone}`);
  }
}

for (const marker of ["tabular-nums", "status-badge", "strokeWidth=\"1.6\"", "focus-visible"]) {
  if (!Object.values(files).some((contents) => contents.includes(marker))) {
    throw new Error(`Missing visual-system behavior: ${marker}`);
  }
}

for (const excluded of ["command-palette", "instrument-drawer", "app-sidebar"]) {
  if (Object.values(files).some((contents) => contents.toLowerCase().includes(excluded))) {
    throw new Error(`S01.2 scope marker found in S01.1 implementation: ${excluded}`);
  }
}

console.log("S01.1 visual system check passed");
