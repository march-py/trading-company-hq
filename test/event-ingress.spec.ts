import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createEventIngressHandler,
  type PersistIdempotentEvent,
} from "../worker/event-ingress";

import {
  hashIdempotencyKey,
} from "../worker/idempotency";

import type {
  IdempotentEventInsert,
} from "../worker/event-store";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const env = {
  APP_ENV: "dev",
  APP_NAME: "trading-company-hq",
  SUPABASE_URL:
    "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "test-key",
  EVENT_INGRESS_TOKEN:
    "test-token",
  EVENT_QUEUE: {
    async send() {},
  },
} as RuntimeEnv;

const validEnvelope = {
  contract_version: 1,
  event_type: "market.quote",
  event_version: 1,
  payload: {
    symbol: "TEST",
    price: 42,
  },
};

interface RequestOptions {
  headers?: Record<string, string>;
  idempotencyKey?: string | null;
}

function request(
  body: string,
  options: RequestOptions = {},
): Request {
  const headers: Record<string, string> = {
    authorization:
      `Bearer ${env.EVENT_INGRESS_TOKEN}`,
    "content-type": "application/json",
    ...options.headers,
  };

  const idempotencyKey =
    options.idempotencyKey === undefined
      ? "test-idempotency-key"
      : options.idempotencyKey;

  if (idempotencyKey !== null) {
    headers["idempotency-key"] =
      idempotencyKey;
  }

  return new Request(
    "https://example.com/api/events/ingest",
    {
      method: "POST",
      headers,
      body,
    },
  );
}

function capturingStore() {
  let captured:
    IdempotentEventInsert
    | undefined;

  const persist:
    PersistIdempotentEvent =
    async (event) => {
      captured = event;

      return {
        status: "created",
        event_id: event.id,
        request_id: event.request_id,
      };
    };

  return {
    persist,
    get captured() {
      return captured;
    },
  };
}

describe(
  "POST /api/events/ingest S03.2",
  () => {
    it(
      "rejects incorrect bearer authorization before persistence",
      async () => {
        const persist =
          vi.fn<PersistIdempotentEvent>();

        const handler =
          createEventIngressHandler(
            persist,
          );

        const response = await handler(
          request(
            JSON.stringify(
              validEnvelope,
            ),
            {
              headers: {
                authorization:
                  "Bearer incorrect",
              },
            },
          ),
          env,
        );

        expect(response.status)
          .toBe(401);

        expect(
          await response.json(),
        ).toEqual({
          error: "unauthorized",
        });

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "preserves the JSON media-type requirement",
      async () => {
        const persist =
          vi.fn<PersistIdempotentEvent>();

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              "{}",
              {
                headers: {
                  "content-type":
                    "text/plain",
                },
              },
            ),
            env,
          );

        expect(response.status)
          .toBe(415);

        expect(
          await response.json(),
        ).toEqual({
          error:
            "unsupported_media_type",
        });

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "preserves the 65,536-byte body limit",
      async () => {
        const persist =
          vi.fn<PersistIdempotentEvent>();

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              "x".repeat(65_537),
            ),
            env,
          );

        expect(response.status)
          .toBe(413);

        expect(
          await response.json(),
        ).toEqual({
          error: "payload_too_large",
        });

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "malformed JSON",
        "{",
      ],
      [
        "wrong contract",
        JSON.stringify({
          ...validEnvelope,
          contract_version: 2,
        }),
      ],
      [
        "invalid event type",
        JSON.stringify({
          ...validEnvelope,
          event_type:
            "Market Quote",
        }),
      ],
      [
        "nonpositive version",
        JSON.stringify({
          ...validEnvelope,
          event_version: 0,
        }),
      ],
      [
        "array payload",
        JSON.stringify({
          ...validEnvelope,
          payload: [],
        }),
      ],
      [
        "server field",
        JSON.stringify({
          ...validEnvelope,
          environment: "prod",
        }),
      ],
    ])(
      "rejects %s as invalid_event",
      async (_label, body) => {
        const persist =
          vi.fn<PersistIdempotentEvent>();

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(body),
            env,
          );

        expect(response.status)
          .toBe(400);

        expect(
          await response.json(),
        ).toEqual({
          error: "invalid_event",
        });

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "missing",
        null,
      ],
      [
        "empty",
        "",
      ],
      [
        "space",
        "has space",
      ],
      [
        "too long",
        "x".repeat(129),
      ],
    ])(
      "rejects %s Idempotency-Key",
      async (
        _label,
        idempotencyKey,
      ) => {
        const persist =
          vi.fn<PersistIdempotentEvent>();

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              JSON.stringify(
                validEnvelope,
              ),
              {
                idempotencyKey,
              },
            ),
            env,
          );

        expect(response.status)
          .toBe(400);

        expect(
          await response.json(),
        ).toEqual({
          error:
            "invalid_idempotency_key",
        });

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "owns IDs and hashes both exact body and Idempotency-Key",
      async () => {
        const rawBody =
          '{ "contract_version": 1, "event_type": "market.quote", "event_version": 1, "payload": { "price": 42 } }';

        const idempotencyKey =
          "client.request:001";

        const capture =
          capturingStore();

        const response =
          await createEventIngressHandler(
            capture.persist,
          )(
            request(
              rawBody,
              {
                idempotencyKey,
              },
            ),
            env,
          );

        const responseBody = (await response.json()) as Record<string, unknown>;

        const expectedBodyHash = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder()
                .encode(rawBody),
            ),
          ),
        ]
          .map(
            (byte) =>
              byte
                .toString(16)
                .padStart(2, "0"),
          )
          .join("");

        expect(response.status)
          .toBe(202);

        expect(
          capture.captured,
        ).toMatchObject({
          id:
            responseBody.event_id,
          environment: "dev",
          request_id:
            responseBody.request_id,
          correlation_id:
            responseBody.request_id,
          request_body_sha256:
            expectedBodyHash,
          idempotency_key_sha256:
            await hashIdempotencyKey(
              idempotencyKey,
            ),
        });
      },
    );

    it(
      "preserves a valid client correlation ID",
      async () => {
        const correlationId =
          "123e4567-e89b-42d3-a456-426614174000";

        const capture =
          capturingStore();

        await createEventIngressHandler(
          capture.persist,
        )(
          request(
            JSON.stringify({
              ...validEnvelope,
              correlation_id:
                correlationId,
            }),
          ),
          env,
        );

        expect(
          capture.captured
            ?.correlation_id,
        ).toBe(correlationId);
      },
    );

    it(
      "returns original IDs for same-key same-body replay",
      async () => {
        const originalEventId =
          crypto.randomUUID();

        const originalRequestId =
          crypto.randomUUID();

        const persist:
          PersistIdempotentEvent =
          async () => ({
            status: "replay",
            event_id:
              originalEventId,
            request_id:
              originalRequestId,
          });

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        expect(response.status)
          .toBe(202);

        expect(
          await response.json(),
        ).toEqual({
          accepted: true,
          event_id:
            originalEventId,
          request_id:
            originalRequestId,
          contract_version: 1,
        });
      },
    );

    it(
      "returns 409 for same-key different-body conflict",
      async () => {
        const persist:
          PersistIdempotentEvent =
          async () => ({
            status: "conflict",
          });

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        expect(response.status)
          .toBe(409);

        expect(
          await response.json(),
        ).toEqual({
          error:
            "idempotency_conflict",
        });
      },
    );

    it(
      "does not acknowledge unavailable durable persistence",
      async () => {
        const persist:
          PersistIdempotentEvent =
          async () => ({
            status: "unavailable",
          });

        const response =
          await createEventIngressHandler(
            persist,
          )(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        expect(response.status)
          .toBe(503);

        expect(
          await response.json(),
        ).toEqual({
          error:
            "persistence_unavailable",
        });
      },
    );

    it(
      "returns 503 when queue dispatch fails after durable persistence",
      async () => {
        const handler =
          createEventIngressHandler(
            async (event) => ({
              status: "created",
              event_id: event.id,
              request_id:
                event.request_id,
            }),
            async () => false,
          );

        const response =
          await handler(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        expect(response.status)
          .toBe(503);

        expect(
          await response.json(),
        ).toEqual({
          error:
            "dispatch_unavailable",
        });
      },
    );

    it(
      "dispatches only after durable event persistence succeeds",
      async () => {
        const order: string[] = [];

        const handler =
          createEventIngressHandler(
            async (event) => {
              order.push(
                "ledger",
              );

              return {
                status: "created",
                event_id: event.id,
                request_id:
                  event.request_id,
              };
            },
            async () => {
              order.push(
                "queue",
              );

              return true;
            },
          );

        const response =
          await handler(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        expect(response.status)
          .toBe(202);

        expect(order)
          .toEqual([
            "ledger",
            "queue",
          ]);
      },
    );

    it(
      "returns 202 only after an event-store success",
      async () => {
        const response =
          await createEventIngressHandler(
            async (event) => ({
              status: "created",
              event_id: event.id,
              request_id:
                event.request_id,
            }),
          )(
            request(
              JSON.stringify(
                validEnvelope,
              ),
            ),
            env,
          );

        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status)
          .toBe(202);

        expect(body).toMatchObject({
          accepted: true,
          contract_version: 1,
        });

        expect(body.event_id)
          .toEqual(
            expect.any(String),
          );

        expect(body.request_id)
          .toEqual(
            expect.any(String),
          );
      },
    );
  },
);
