import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  beginProcessingReceipt,
  markProcessingSucceeded,
  recordProcessingFailure,
} from "../worker/processing-store";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const env = {
  APP_ENV: "dev",
  APP_NAME: "trading-company-hq",
  SUPABASE_URL:
    "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "test-service-role",
  EVENT_INGRESS_TOKEN:
    "test-token",
} as RuntimeEnv;

afterEach(() => {
  vi.restoreAllMocks();
});

describe(
  "S03.2 processing receipt store",
  () => {
    it(
      "creates the first processing receipt with attempt_count 1",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([]),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 201,
              },
            ),
          );

        const eventId =
          crypto.randomUUID();

        const result =
          await beginProcessingReceipt(
            eventId,
            "dev",
            "queue-message-1",
            env,
          );

        expect(result).toEqual({
          status: "started",
          attempt_count: 1,
        });

        expect(fetchMock)
          .toHaveBeenCalledTimes(2);

        const [
          endpoint,
          init,
        ] = fetchMock.mock.calls[1];

        expect(
          new URL(
            String(endpoint),
          ).searchParams.get(
            "on_conflict",
          ),
        ).toBe("event_id");

        expect(init?.method)
          .toBe("POST");

        const body = JSON.parse(
          String(init?.body),
        ) as Record<
          string,
          unknown
        >;

        expect(body).toMatchObject({
          event_id: eventId,
          environment: "dev",
          status: "processing",
          attempt_count: 1,
          last_queue_message_id:
            "queue-message-1",
          last_error_code: null,
        });

        expect(
          body.first_started_at,
        ).toEqual(
          expect.any(String),
        );

        expect(
          body.last_attempt_at,
        ).toEqual(
          expect.any(String),
        );
      },
    );

    it(
      "increments an existing processing attempt",
      async () => {
        const firstStartedAt =
          "2026-09-14T01:00:00.000Z";

        vi.spyOn(
          globalThis,
          "fetch",
        )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  event_id:
                    crypto.randomUUID(),
                  environment:
                    "dev",
                  status:
                    "processing",
                  attempt_count: 2,
                  first_started_at:
                    firstStartedAt,
                  processed_at: null,
                },
              ]),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 201,
              },
            ),
          );

        const result =
          await beginProcessingReceipt(
            crypto.randomUUID(),
            "dev",
            "queue-message-2",
            env,
          );

        expect(result).toEqual({
          status: "started",
          attempt_count: 3,
        });

        const fetchMock =
          vi.mocked(
            globalThis.fetch,
          );

        const body = JSON.parse(
          String(
            fetchMock.mock
              .calls[1][1]?.body,
          ),
        ) as Record<
          string,
          unknown
        >;

        expect(
          body.attempt_count,
        ).toBe(3);

        expect(
          body.first_started_at,
        ).toBe(firstStartedAt);
      },
    );

    it(
      "returns already_succeeded without another write",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  event_id:
                    crypto.randomUUID(),
                  environment:
                    "dev",
                  status:
                    "succeeded",
                  attempt_count: 1,
                  first_started_at:
                    "2026-09-14T01:00:00.000Z",
                  processed_at:
                    "2026-09-14T01:00:01.000Z",
                },
              ]),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          );

        const result =
          await beginProcessingReceipt(
            crypto.randomUUID(),
            "dev",
            "queue-message-3",
            env,
          );

        expect(result).toEqual({
          status:
            "already_succeeded",
        });

        expect(fetchMock)
          .toHaveBeenCalledTimes(1);
      },
    );

    it(
      "marks a processing receipt succeeded",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 204,
              },
            ),
          );

        await expect(
          markProcessingSucceeded(
            crypto.randomUUID(),
            "dev",
            "queue-message-4",
            env,
          ),
        ).resolves.toBe(true);

        const [
          endpoint,
          init,
        ] = fetchMock.mock.calls[0];

        expect(init?.method)
          .toBe("PATCH");

        expect(
          new URL(
            String(endpoint),
          ).pathname,
        ).toBe(
          "/rest/v1/event_processing_receipts",
        );

        const body = JSON.parse(
          String(init?.body),
        ) as Record<
          string,
          unknown
        >;

        expect(body).toMatchObject({
          status: "succeeded",
          last_queue_message_id:
            "queue-message-4",
          last_error_code: null,
        });
      },
    );

    it(
      "stores only a stable machine failure code",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 204,
              },
            ),
          );

        await expect(
          recordProcessingFailure(
            crypto.randomUUID(),
            "dev",
            "queue-message-5",
            "processing_failed",
            env,
          ),
        ).resolves.toBe(true);

        const body = JSON.parse(
          String(
            fetchMock.mock
              .calls[0][1]?.body,
          ),
        ) as Record<
          string,
          unknown
        >;

        expect(
          body.last_error_code,
        ).toBe(
          "processing_failed",
        );

        expect(
          JSON.stringify(body),
        ).not.toContain(
          "stack",
        );
      },
    );

    it(
      "returns unavailable when the receipt store cannot be read",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValueOnce(
          new Response(
            null,
            {
              status: 503,
            },
          ),
        );

        await expect(
          beginProcessingReceipt(
            crypto.randomUUID(),
            "dev",
            "queue-message-6",
            env,
          ),
        ).resolves.toEqual({
          status: "unavailable",
        });
      },
    );
  },
);
