import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tokens = await readFile(new URL("src/design-tokens.css", root), "utf8");
const styles = await readFile(new URL("src/styles.css", root), "utf8");

const required = {
  "--color-canvas": "#f7f6f1",
  "--color-canvas-raised": "#eeece3",
  "--color-surface-3": "#dce3d8",
  "--color-sage": "#a9b7a2",
  "--color-sage-deep": "#7e927c",
  "--color-sea-glass": "#afc7c8",
  "--color-text-primary": "#2e3834",
  "--color-accent": "#e9a66b",
  "--color-accent-soft": "#f0d1b5",
  "--color-terracotta": "#d98555",
  "--color-focus": "#a84d28",
};

for (const [name, value] of Object.entries(required)) {
  if (!tokens.includes(`${name}: ${value}`)) throw new Error(`Missing palette token ${name}: ${value}`);
}

if (!tokens.includes("color-scheme: light")) throw new Error("Calm light color scheme is not active");
if (!styles.includes("radial-gradient") || !styles.includes("linear-gradient")) throw new Error("Organic blended background is missing");

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const checks = [
  ["primary on porcelain", "#2e3834", "#f7f6f1", 4.5],
  ["secondary on porcelain", "#46534f", "#f7f6f1", 4.5],
  ["accent text on porcelain", "#9f4c28", "#f7f6f1", 4.5],
  ["focus on porcelain", "#a84d28", "#f7f6f1", 4.5],
  ["ink on muted apricot", "#2e3834", "#e9a66b", 4.5],
  ["deep sage structure on porcelain", "#71866f", "#f7f6f1", 3],
];

for (const [label, foreground, background, minimum] of checks) {
  const ratio = contrast(foreground, background);
  if (ratio < minimum) throw new Error(`${label} contrast ${ratio.toFixed(2)} is below ${minimum}:1`);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
}

console.log("S01 calm palette check passed");
