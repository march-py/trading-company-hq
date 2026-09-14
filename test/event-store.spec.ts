import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  persistIdempotentEvent,
  type IdempotentEventInsert,
} from "../worker/event-store";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const env = {
  APP_ENV: "dev",
  APP_NAME: "trading-company-hq",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  EVENT_INGRESS_TOKEN: "test-token",
} as RuntimeEnv;

function event(
  overrides: Partial<IdempotentEventInsert> = {},
): IdempotentEventInsert {
  return {
    contract_version: 1,
    event_type: "system.validation",
    event_version: 1,
    occurred_at: null,
    source_id: null,
    provenance_record_id: null,
    external_event_id: null,
    subject_type: null,
    subject_id: null,
    correlation_id: crypto.randomUUID(),
    causation_event_id: null,
    payload: {
      checkpoint: "s03.2-event-store",
    },
    id: crypto.randomUUID(),
    environment: "dev",
    request_id: crypto.randomUUID(),
    request_body_sha256: "a".repeat(64),
    idempotency_key_sha256: "b".repeat(64),
    ...overrides,
  };
}

describe("S03.2 idempotent event store", () => {
  it("returns created when the first durable insert succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 201 }),
      );

    const candidate = event();

    const result = await persistIdempotentEvent(
      candidate,
      env,
    );

    expect(result).toEqual({
      status: "created",
      event_id: candidate.id,
      request_id: candidate.request_id,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [endpoint, init] = fetchMock.mock.calls[0];

    expect(String(endpoint)).toBe(
      "https://example.supabase.co/rest/v1/event_ledger",
    );

    expect(init?.method).toBe("POST");

    expect(init?.headers).toMatchObject({
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization:
        `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    });

    fetchMock.mockRestore();
  });

  it("returns the original IDs for same-key same-body replay", async () => {
    const originalEventId = crypto.randomUUID();
    const originalRequestId = crypto.randomUUID();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "23505",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: originalEventId,
              request_id: originalRequestId,
              request_body_sha256: "a".repeat(64),
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const result = await persistIdempotentEvent(
      event(),
      env,
    );

    expect(result).toEqual({
      status: "replay",
      event_id: originalEventId,
      request_id: originalRequestId,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [lookupEndpoint, lookupInit] =
      fetchMock.mock.calls[1];

    const lookupUrl = new URL(String(lookupEndpoint));

    expect(lookupInit?.method).toBe("GET");

    expect(
      lookupUrl.searchParams.get("environment"),
    ).toBe("eq.dev");

    expect(
      lookupUrl.searchParams.get(
        "idempotency_key_sha256",
      ),
    ).toBe(`eq.${"b".repeat(64)}`);

    fetchMock.mockRestore();
  });

  it("returns conflict for same-key different-body replay", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: crypto.randomUUID(),
              request_id: crypto.randomUUID(),
              request_body_sha256: "c".repeat(64),
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const result = await persistIdempotentEvent(
      event({
        request_body_sha256: "a".repeat(64),
      }),
      env,
    );

    expect(result).toEqual({
      status: "conflict",
    });

    fetchMock.mockRestore();
  });

  it("returns unavailable when insert and recovery lookup fail", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 503 }),
      );

    const result = await persistIdempotentEvent(
      event(),
      env,
    );

    expect(result).toEqual({
      status: "unavailable",
    });

    fetchMock.mockRestore();
  });

  it("recovers a committed insert after an ambiguous transport failure", async () => {
    const originalEventId = crypto.randomUUID();
    const originalRequestId = crypto.randomUUID();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(
        new Error("connection lost after send"),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: originalEventId,
              request_id: originalRequestId,
              request_body_sha256: "a".repeat(64),
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const result = await persistIdempotentEvent(
      event(),
      env,
    );

    expect(result).toEqual({
      status: "replay",
      event_id: originalEventId,
      request_id: originalRequestId,
    });

    fetchMock.mockRestore();
  });
});
