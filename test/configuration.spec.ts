import { describe, expect, it } from "vitest";
import {
  requireAppEnvironment,
  resolveFeatureFlag,
  selectEnvironmentRecords,
} from "../src/data-core/configuration";

describe("data-core environment isolation", () => {
  it("accepts only the two explicit application environments", () => {
    expect(requireAppEnvironment("dev")).toBe("dev");
    expect(requireAppEnvironment("prod")).toBe("prod");
    expect(() => requireAppEnvironment("production")).toThrow(/APP_ENV/);
  });

  it("never falls back across environments", () => {
    const records = [
      { environment: "dev", key: "signal_panel", state: "enabled" },
      { environment: "prod", key: "signal_panel", state: "disabled" },
    ];

    expect(selectEnvironmentRecords(records, "dev")).toEqual([records[0]]);
    expect(selectEnvironmentRecords(records, "prod")).toEqual([records[1]]);
  });

  it("resolves missing or invalid flags as disabled", () => {
    const records = [
      { environment: "dev", key: "signal_panel", state: "shadow" },
      { environment: "prod", key: "invalid_flag", state: "unexpected" },
    ];

    expect(resolveFeatureFlag(records, "dev", "SIGNAL_PANEL")).toBe("shadow");
    expect(resolveFeatureFlag(records, "prod", "signal_panel")).toBe("disabled");
    expect(resolveFeatureFlag(records, "prod", "invalid_flag")).toBe("disabled");
  });
});
