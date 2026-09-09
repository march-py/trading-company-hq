import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Worker API", () => {
  it("reports a healthy DEV environment", async () => {
    const response = await SELF.fetch("https://example.com/api/health");
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ status: "ok", app: "trading-company-hq", environment: "dev" });
    expect(body.time).toEqual(expect.any(String));
  });

  it("returns a safe JSON 404 for unknown API routes", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
