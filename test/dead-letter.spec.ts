import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  handleDeadLetterMessage,
  storeDeadLetter,
} from "../worker/dead-letter";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

import type {
  QueueMessageLike,
} from "../worker/queue-consumer";

const env = {
  APP_ENV: "dev",
  APP_NAME:
    "trading-company-hq",
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

function queueMessage(
  body: unknown,
): {
  message: QueueMessageLike;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
} {
  const ack = vi.fn();
  const retry = vi.fn();

  return {
    message: {
      id: "dlq-message-1",
      body,
      ack,
      retry,
    },
    ack,
    retry,
  };
}

describe(
  "S03.2 dead-letter storage",
  () => {
    it(
      "persists only the bounded sanitized failure record",
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
                status: 201,
              },
            ),
          );

        const eventId =
          crypto.randomUUID();

        await expect(
          storeDeadLetter(
            {
              event_id:
                eventId,
              environment:
                "dev",
              queue_message_id:
                "dlq-message-1",
              failure_code:
                "processing_failed",
              payload: {
                queue_contract_version:
                  1,
                event_id:
                  eventId,
                environment:
                  "dev",
                valid_queue_message:
                  true,
              },
            },
            env,
          ),
        ).resolves.toBe(true);

        const [
          endpoint,
          init,
        ] = fetchMock.mock.calls[0];

        expect(
          String(endpoint),
        ).toBe(
          "https://example.supabase.co/rest/v1/event_dead_letters",
        );

        expect(init?.method)
          .toBe("POST");

        const body = JSON.parse(
          String(init?.body),
        ) as Record<
          string,
          unknown
        >;

        expect(body).toEqual({
          event_id:
            eventId,
          environment:
            "dev",
          queue_message_id:
            "dlq-message-1",
          failure_code:
            "processing_failed",
          payload: {
            queue_contract_version:
              1,
            event_id:
              eventId,
            environment:
              "dev",
            valid_queue_message:
              true,
          },
        });

        expect(
          JSON.stringify(body),
        ).not.toContain(
          "stack",
        );
      },
    );

    it(
      "treats an already-recorded queue message as durable success",
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
                status: 409,
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  queue_message_id:
                    "dlq-message-1",
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

        await expect(
          storeDeadLetter(
            {
              event_id: null,
              environment:
                "dev",
              queue_message_id:
                "dlq-message-1",
              failure_code:
                "invalid_queue_message",
              payload: {
                valid_queue_message:
                  false,
              },
            },
            env,
          ),
        ).resolves.toBe(true);

        expect(fetchMock)
          .toHaveBeenCalledTimes(2);
      },
    );
  },
);

describe(
  "S03.2 DLQ consumer",
  () => {
    it(
      "acks a valid message only after durable dead-letter storage",
      async () => {
        const eventId =
          crypto.randomUUID();

        const {
          message,
          ack,
          retry,
        } = queueMessage({
          queue_contract_version:
            1,
          event_id:
            eventId,
          environment:
            "dev",
        });

        const store = vi.fn(
          async () => true,
        );

        await handleDeadLetterMessage(
          message,
          env,
          store,
        );

        expect(store)
          .toHaveBeenCalledWith(
            {
              event_id:
                eventId,
              environment:
                "dev",
              queue_message_id:
                "dlq-message-1",
              failure_code:
                "processing_failed",
              payload: {
                queue_contract_version:
                  1,
                event_id:
                  eventId,
                environment:
                  "dev",
                valid_queue_message:
                  true,
              },
            },
            env,
          );

        expect(ack)
          .toHaveBeenCalledOnce();

        expect(retry)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "stores invalid queue content without copying the raw body",
      async () => {
        const {
          message,
          ack,
        } = queueMessage({
          secret_like_field:
            "DO-NOT-COPY",
        });

        const store = vi.fn(
          async () => true,
        );

        await handleDeadLetterMessage(
          message,
          env,
          store,
        );

        const record =
          store.mock.calls[0][0];

        expect(
          record.event_id,
        ).toBeNull();

        expect(
          record.failure_code,
        ).toBe(
          "invalid_queue_message",
        );

        expect(
          JSON.stringify(
            record.payload,
          ),
        ).not.toContain(
          "DO-NOT-COPY",
        );

        expect(ack)
          .toHaveBeenCalledOnce();
      },
    );

    it(
      "retries instead of acking when dead-letter persistence fails",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage({
          invalid: true,
        });

        await handleDeadLetterMessage(
          message,
          env,
          async () => false,
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );
  },
);
