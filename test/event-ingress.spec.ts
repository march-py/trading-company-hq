import { describe, expect, it, vi } from "vitest";
import { createEventIngressHandler } from "../worker/event-ingress";
import { persistEvent, type EventLedgerInsert, type PersistEvent, type RuntimeEnv } from "../worker/event-persistence";

const env = {
  APP_ENV: "dev",
  APP_NAME: "trading-company-hq",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  EVENT_INGRESS_TOKEN: "test-token",
} as RuntimeEnv;

const validEnvelope = {
  contract_version: 1,
  event_type: "market.quote",
  event_version: 1,
  payload: { symbol: "TEST", price: 42 },
};

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/events/ingest", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EVENT_INGRESS_TOKEN}`,
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

function capturingPersistence(result = true) {
  let captured: EventLedgerInsert | undefined;
  const persist: PersistEvent = async (event) => {
    captured = event;
    return result;
  };
  return { persist, get captured() { return captured; } };
}

describe("POST /api/events/ingest", () => {
  it("rejects missing or incorrect bearer authorization before persistence", async () => {
    const persist = vi.fn<PersistEvent>();
    const handler = createEventIngressHandler(persist);
    const response = await handler(request(JSON.stringify(validEnvelope), { authorization: "Bearer incorrect" }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("requires a JSON media type", async () => {
    const persist = vi.fn<PersistEvent>();
    const response = await createEventIngressHandler(persist)(request("{}", { "content-type": "text/plain" }), env);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects a raw body larger than 65,536 bytes", async () => {
    const persist = vi.fn<PersistEvent>();
    const response = await createEventIngressHandler(persist)(request("x".repeat(65_537)), env);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong contract", JSON.stringify({ ...validEnvelope, contract_version: 2 })],
    ["invalid event type", JSON.stringify({ ...validEnvelope, event_type: "Market Quote" })],
    ["nonpositive version", JSON.stringify({ ...validEnvelope, event_version: 0 })],
    ["array payload", JSON.stringify({ ...validEnvelope, payload: [] })],
    ["provenance without source", JSON.stringify({ ...validEnvelope, provenance_record_id: "123e4567-e89b-42d3-a456-426614174000" })],
    ["unpaired subject", JSON.stringify({ ...validEnvelope, subject_type: "instrument" })],
    ["server field", JSON.stringify({ ...validEnvelope, environment: "prod" })],
  ])("rejects %s as invalid_event", async (_label, body) => {
    const persist = vi.fn<PersistEvent>();
    const response = await createEventIngressHandler(persist)(request(body), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_event" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("owns identifiers and environment and hashes the exact raw body", async () => {
    const rawBody = '{ "contract_version": 1, "event_type": "market.quote", "event_version": 1, "payload": { "price": 42 } }';
    const capture = capturingPersistence();
    const response = await createEventIngressHandler(capture.persist)(request(rawBody), env);
    const responseBody = await response.json() as Record<string, unknown>;
    const expectedHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody)))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    expect(response.status).toBe(202);
    expect(capture.captured).toMatchObject({
      id: responseBody.event_id,
      environment: "dev",
      request_id: responseBody.request_id,
      correlation_id: responseBody.request_id,
      request_body_sha256: expectedHash,
    });
  });

  it("preserves a valid client correlation ID", async () => {
    const correlationId = "123e4567-e89b-42d3-a456-426614174000";
    const capture = capturingPersistence();
    await createEventIngressHandler(capture.persist)(request(JSON.stringify({ ...validEnvelope, correlation_id: correlationId })), env);

    expect(capture.captured?.correlation_id).toBe(correlationId);
  });

  it("does not acknowledge a failed persistence attempt", async () => {
    const response = await createEventIngressHandler(async () => false)(request(JSON.stringify(validEnvelope)), env);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "persistence_unavailable" });
  });

  it("returns 202 only after persistence succeeds", async () => {
    const response = await createEventIngressHandler(async () => true)(request(JSON.stringify(validEnvelope)), env);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ accepted: true, contract_version: 1 });
    expect(body.event_id).toEqual(expect.any(String));
    expect(body.request_id).toEqual(expect.any(String));
  });
});

describe("Supabase REST persistence", () => {
  it("uses only runtime bindings and requires a 201 insert response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const event = {
      ...validEnvelope,
      occurred_at: null,
      source_id: null,
      provenance_record_id: null,
      external_event_id: null,
      subject_type: null,
      subject_id: null,
      correlation_id: crypto.randomUUID(),
      causation_event_id: null,
      id: crypto.randomUUID(),
      environment: "dev",
      request_id: crypto.randomUUID(),
      request_body_sha256: "a".repeat(64),
    } satisfies EventLedgerInsert;

    await expect(persistEvent(event, env)).resolves.toBe(true);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(String(endpoint)).toBe("https://example.supabase.co/rest/v1/event_ledger");
    expect(init?.headers).toMatchObject({
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      prefer: "return=minimal",
    });
    fetchMock.mockRestore();
  });

  it("treats any non-201 response as a persistence failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await expect(persistEvent({} as EventLedgerInsert, env)).resolves.toBe(false);
    fetchMock.mockRestore();
  });
});
