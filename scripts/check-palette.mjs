import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tokens = await readFile(new URL("src/design-tokens.css", root), "utf8");
const styles = await readFile(new URL("src/styles.css", root), "utf8");

const required = {
  "--color-canvas": "#f4f0e6",
  "--color-canvas-raised": "#eae4d4",
  "--color-surface-3": "#d9d3af",
  "--color-text-primary": "#283126",
  "--color-accent": "#f47c20",
  "--color-accent-soft": "#e99a4a",
  "--color-focus": "#b94707",
};

for (const [name, value] of Object.entries(required)) {
  if (!tokens.includes(`${name}: ${value}`)) throw new Error(`Missing palette token ${name}: ${value}`);
}

if (!tokens.includes("color-scheme: light")) throw new Error("Warm light color scheme is not active");
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
  ["primary on ivory", "#283126", "#f4f0e6", 4.5],
  ["secondary on ivory", "#3b4636", "#f4f0e6", 4.5],
  ["accent text on ivory", "#a9420a", "#f4f0e6", 4.5],
  ["focus on ivory", "#b94707", "#f4f0e6", 4.5],
  ["ink on vivid orange", "#283126", "#f47c20", 4.5],
  ["strong orange structure on ivory", "#d45d13", "#f4f0e6", 3],
];

for (const [label, foreground, background, minimum] of checks) {
  const ratio = contrast(foreground, background);
  if (ratio < minimum) throw new Error(`${label} contrast ${ratio.toFixed(2)} is below ${minimum}:1`);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
}

console.log("S01 warm palette check passed");
