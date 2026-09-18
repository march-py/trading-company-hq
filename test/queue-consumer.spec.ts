import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  handleMainQueueBatch,
  handleMainQueueMessage,
  isEventQueueMessageV1,
  QUEUE_RETRY_DELAY_SECONDS,
  readCanonicalEvent,
  type QueueConsumerDependencies,
  type QueueMessageLike,
} from "../worker/queue-consumer";

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

function validBody(
  eventId = crypto.randomUUID(),
) {
  return {
    queue_contract_version: 1,
    event_id: eventId,
    environment: "dev",
  } as const;
}

function queueMessage(
  body: unknown = validBody(),
) {
  const ack = vi.fn();
  const retry = vi.fn();

  const message:
    QueueMessageLike = {
      id: "queue-message-1",
      body,
      ack,
      retry,
    };

  return {
    message,
    ack,
    retry,
  };
}

function dependencies(
  overrides:
    Partial<QueueConsumerDependencies> = {},
): QueueConsumerDependencies {
  return {
    readCanonicalEvent:
      async (eventId) => ({
        status: "found",
        event: {
          id: eventId,
          environment: "dev",
        },
      }),

    beginReceipt:
      async () => ({
        status: "started",
        attempt_count: 1,
      }),

    markSucceeded:
      async () => true,

    recordFailure:
      async () => true,

    ...overrides,
  };
}

describe(
  "S03.2 queue message contract",
  () => {
    it(
      "accepts the exact Queue Message V1 identity",
      () => {
        expect(
          isEventQueueMessageV1(
            validBody(),
          ),
        ).toBe(true);
      },
    );

    it.each([
      null,
      {},
      {
        queue_contract_version: 2,
        event_id:
          crypto.randomUUID(),
        environment: "dev",
      },
      {
        queue_contract_version: 1,
        event_id: "not-a-uuid",
        environment: "dev",
      },
      {
        queue_contract_version: 1,
        event_id:
          crypto.randomUUID(),
        environment: "staging",
      },
      {
        ...validBody(),
        payload: {
          forbidden: true,
        },
      },
    ])(
      "rejects invalid queue message %#",
      (body) => {
        expect(
          isEventQueueMessageV1(
            body,
          ),
        ).toBe(false);
      },
    );
  },
);

describe(
  "S03.2 canonical ledger reader",
  () => {
    it(
      "reads only canonical identity from event_ledger",
      async () => {
        const eventId =
          crypto.randomUUID();

        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  id: eventId,
                  environment:
                    "dev",
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
          readCanonicalEvent(
            eventId,
            env,
          ),
        ).resolves.toEqual({
          status: "found",
          event: {
            id: eventId,
            environment: "dev",
          },
        });

        const [
          endpoint,
          init,
        ] = fetchMock.mock.calls[0];

        const url =
          new URL(
            String(endpoint),
          );

        expect(init?.method)
          .toBe("GET");

        expect(
          url.pathname,
        ).toBe(
          "/rest/v1/event_ledger",
        );

        expect(
          url.searchParams.get(
            "select",
          ),
        ).toBe(
          "id,environment",
        );

        expect(
          url.searchParams.get(
            "id",
          ),
        ).toBe(
          `eq.${eventId}`,
        );
      },
    );

    it(
      "returns missing when canonical event does not exist",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValueOnce(
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
        );

        await expect(
          readCanonicalEvent(
            crypto.randomUUID(),
            env,
          ),
        ).resolves.toEqual({
          status: "missing",
        });
      },
    );
  },
);

describe(
  "S03.2 main queue consumer",
  () => {
    it(
      "acks only after a successful processing receipt completion",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        const order: string[] = [];

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            beginReceipt:
              async () => {
                order.push(
                  "begin",
                );

                return {
                  status:
                    "started",
                  attempt_count: 1,
                };
              },

            markSucceeded:
              async () => {
                order.push(
                  "succeeded",
                );

                return true;
              },
          }),
        );

        expect(order).toEqual([
          "begin",
          "succeeded",
        ]);

        expect(ack)
          .toHaveBeenCalledTimes(1);

        expect(retry)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "acks an already-succeeded duplicate without processing again",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        const markSucceeded =
          vi.fn(
            async () => true,
          );

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            beginReceipt:
              async () => ({
                status:
                  "already_succeeded",
              }),
            markSucceeded,
          }),
        );

        expect(ack)
          .toHaveBeenCalledTimes(1);

        expect(retry)
          .not.toHaveBeenCalled();

        expect(markSucceeded)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "retries an invalid queue message with the bounded delay",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage({
          invalid: true,
        });

        await handleMainQueueMessage(
          message,
          env,
          dependencies(),
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds:
              QUEUE_RETRY_DELAY_SECONDS,
          });
      },
    );

    it(
      "retries when the canonical ledger is unavailable",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            readCanonicalEvent:
              async () => ({
                status:
                  "unavailable",
              }),
          }),
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );

    it(
      "retries when the canonical event is missing",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            readCanonicalEvent:
              async () => ({
                status: "missing",
              }),
          }),
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );

    it(
      "retries an environment mismatch",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            readCanonicalEvent:
              async (
                eventId,
              ) => ({
                status: "found",
                event: {
                  id: eventId,
                  environment:
                    "prod",
                },
              }),
          }),
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );

    it(
      "retries when the processing store is unavailable",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            beginReceipt:
              async () => ({
                status:
                  "unavailable",
              }),
          }),
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );

    it(
      "records a stable failure code and retries when success cannot be persisted",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        const recordFailure =
          vi.fn(
            async () => true,
          );

        await handleMainQueueMessage(
          message,
          env,
          dependencies({
            markSucceeded:
              async () => false,
            recordFailure,
          }),
        );

        expect(
          recordFailure,
        ).toHaveBeenCalledWith(
          expect.any(String),
          "dev",
          "queue-message-1",
          "processing_store_unavailable",
          env,
        );

        expect(ack)
          .not.toHaveBeenCalled();

        expect(retry)
          .toHaveBeenCalledWith({
            delaySeconds: 30,
          });
      },
    );

    it(
      "runs best-effort opportunity post-processing after core success",
      async () => {
        const {
          message,
          ack,
          retry,
        } = queueMessage();

        const opportunityId =
          crypto.randomUUID();

        const postProcessOpportunity =
          vi.fn(
            async () => {
              throw new Error(
                "snapshot failure",
              );
            },
          );

        await expect(
          handleMainQueueMessage(
            message,
            env,
            dependencies({
              processOpportunity:
                async () => ({
                  status: "created",
                  opportunity_id:
                    opportunityId,
                }),
              postProcessOpportunity,
            }),
          ),
        ).resolves.toBeUndefined();

        expect(ack)
          .toHaveBeenCalledTimes(1);

        expect(retry)
          .not.toHaveBeenCalled();

        expect(
          postProcessOpportunity,
        ).toHaveBeenCalledWith(
          opportunityId,
          env,
        );
      },
    );

    it(
      "processes a batch with awaited iteration",
      async () => {
        const first =
          queueMessage(
            validBody(),
          );

        const second =
          queueMessage(
            validBody(),
          );

        const order: string[] = [];

        await handleMainQueueBatch(
          {
            queue:
              "trading-company-events-dev",
            messages: [
              first.message,
              second.message,
            ],
          },
          env,
          dependencies({
            beginReceipt:
              async (
                _eventId,
                _environment,
                queueMessageId,
              ) => {
                order.push(
                  `begin:${queueMessageId}`,
                );

                return {
                  status:
                    "started",
                  attempt_count: 1,
                };
              },

            markSucceeded:
              async (
                _eventId,
                _environment,
                queueMessageId,
              ) => {
                order.push(
                  `done:${queueMessageId}`,
                );

                return true;
              },
          }),
        );

        expect(
          first.ack,
        ).toHaveBeenCalledOnce();

        expect(
          second.ack,
        ).toHaveBeenCalledOnce();

        expect(
          first.retry,
        ).not.toHaveBeenCalled();

        expect(
          second.retry,
        ).not.toHaveBeenCalled();

        expect(order).toEqual([
          "begin:queue-message-1",
          "done:queue-message-1",
          "begin:queue-message-1",
          "done:queue-message-1",
        ]);
      },
    );
  },
);
