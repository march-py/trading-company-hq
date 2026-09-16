import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const appPath = new URL("../src/App.tsx", import.meta.url);
const setupFinderPath = new URL("../src/SetupFinder.tsx", import.meta.url);
const setupFinderCssPath = new URL("../src/setup-finder.css", import.meta.url);

describe("S05.1 Setup Finder surface", () => {
  it("exposes Setup Finder in the HQ navigation", async () => {
    const app = await readFile(appPath, "utf8");

    expect(app).toContain('id: "setup-finder"');
    expect(app).toContain('label: "Setup Finder"');
    expect(app).toContain('stage: "S05.1"');
    expect(app).toContain('available: true');
    expect(app).toContain('<SetupFinder />');
  });

  it("uses the private opportunity list and detail APIs", async () => {
    const setupFinder = await readFile(setupFinderPath, "utf8");

    expect(setupFinder).toContain('fetch(`/api/opportunities?${params.toString()}`');
    expect(setupFinder).toContain('fetch(`/api/opportunities/${selectedId}`');
    expect(setupFinder).toContain("instrument_id");
    expect(setupFinder).toContain("venue_instrument_id");
    expect(setupFinder).toContain("source_event");
    expect(setupFinder).toContain("transitions");
  });

  it("keeps S05.1 review read-only and does not invent S06 strategy rules", async () => {
    const setupFinder = await readFile(setupFinderPath, "utf8");

    expect(setupFinder).toContain('detail="READ ONLY"');
    expect(setupFinder).toContain("Deterministic strategy-rule evaluation is introduced in S06");
    expect(setupFinder).not.toContain('method: "POST"');
    expect(setupFinder).not.toContain('method: "PATCH"');
    expect(setupFinder).not.toContain('method: "DELETE"');
  });

  it("ships dedicated responsive styling", async () => {
    const css = await readFile(setupFinderCssPath, "utf8");

    expect(css).toContain(".setup-workspace");
    expect(css).toContain(".setup-detail");
    expect(css).toContain("@media (max-width: 1080px)");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
