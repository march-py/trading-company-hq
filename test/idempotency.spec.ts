import { describe, expect, it } from "vitest";
import {
  hashIdempotencyKey,
  validateIdempotencyKey,
} from "../worker/idempotency";

describe("S03.2 Idempotency-Key contract", () => {
  it.each([
    "a",
    "retry-001",
    "provider:event_123",
    "client.request:2026-09-14",
    "A_B-C.D:123",
    "x".repeat(128),
  ])("accepts machine-safe key %s", (key) => {
    expect(validateIdempotencyKey(key)).toBe(key);
  });

  it.each([
    null,
    "",
    " ",
    "has space",
    "slash/not-allowed",
    "question?",
    "unicode-é",
    "x".repeat(129),
  ])("rejects invalid key %s", (key) => {
    expect(validateIdempotencyKey(key)).toBeNull();
  });

  it("hashes the exact key as lowercase SHA-256", async () => {
    const key = "client.request:2026-09-14";

    const expected = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(key),
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const result = await hashIdempotencyKey(key);

    expect(result).toBe(expected);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the hash when the exact key changes", async () => {
    const first = await hashIdempotencyKey("retry-001");
    const second = await hashIdempotencyKey("retry-002");

    expect(first).not.toBe(second);
  });
});
