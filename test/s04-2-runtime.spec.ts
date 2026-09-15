import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  materializeOpportunityForEvent,
  type OpportunityInsert,
} from "../worker/opportunity-store";

import {
  handleMainQueueMessage,
  type QueueConsumerDependencies,
  type QueueMessageLike,
} from "../worker/queue-consumer";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

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

function tradingViewEvent(
  id = crypto.randomUUID(),
) {
  return {
    id,
    environment: "dev",
    event_type:
      "tradingview.signal",
    event_version: 1,
    payload: {
      signal_type:
        "failed_sfp",
      strategy_id:
        "failed_sfp",
      strategy_version: 1,
      exchange:
        "BINANCE",
      ticker:
        "BTCUSDT",
      interval:
        "12H",
      bar_time:
        "2026-09-14T12:00:00.000Z",
      triggered_at:
        "2026-09-14T12:00:03.000Z",
      direction:
        "long",
      setup_key:
        "failed_sfp",
      payload: {
        confirmation:
          "test",
      },
    },
  };
}

describe(
  "S04.2 opportunity store",
  () => {
    it(
      "creates a deterministic TradingView opportunity candidate",
      async () => {
        const event =
          tradingViewEvent();

        let inserted:
          OpportunityInsert | null =
            null;

        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (
            input,
            init,
          ) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                event,
              ]);
            }

            if (
              url.pathname
                === "/rest/v1/opportunities"
              && init?.method
                === "POST"
            ) {
              inserted =
                JSON.parse(
                  String(
                    init.body,
                  ),
                ) as OpportunityInsert;

              return new Response(
                null,
                {
                  status: 201,
                },
              );
            }

            throw new Error(
              `unexpected fetch: ${url}`,
            );
          },
        );

        const result =
          await materializeOpportunityForEvent(
            event.id,
            env,
          );

        expect(result.status)
          .toBe("created");

        expect(inserted)
          .not.toBeNull();

        expect(
          inserted
            ?.source_event_id,
        ).toBe(event.id);

        expect(
          inserted
            ?.dedupe_key_sha256,
        ).toMatch(
          /^[0-9a-f]{64}$/,
        );

        expect(
          inserted
            ?.tradingview_deep_link,
        ).toBe(
          "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT",
        );

        expect(
          inserted?.status,
        ).toBe("detected");
      },
    );

    it(
      "replays a semantic duplicate without creating a second opportunity",
      async () => {
        const event =
          tradingViewEvent();

        const existingId =
          crypto.randomUUID();

        let candidate:
          OpportunityInsert | null =
            null;

        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (
            input,
            init,
          ) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                event,
              ]);
            }

            if (
              url.pathname
                === "/rest/v1/opportunities"
              && init?.method
                === "POST"
            ) {
              candidate =
                JSON.parse(
                  String(
                    init.body,
                  ),
                ) as OpportunityInsert;

              return new Response(
                null,
                {
                  status: 409,
                },
              );
            }

            if (
              url.pathname
              === "/rest/v1/opportunities"
            ) {
              if (
                url.searchParams
                  .has(
                    "source_event_id",
                  )
              ) {
                return Response.json(
                  [],
                );
              }

              if (
                url.searchParams
                  .has(
                    "dedupe_key_sha256",
                  )
              ) {
                if (
                  candidate === null
                ) {
                  throw new Error(
                    "candidate missing",
                  );
                }

                return Response.json([
                  {
                    ...candidate,
                    id:
                      existingId,
                    source_event_id:
                      crypto.randomUUID(),
                  },
                ]);
              }
            }

            throw new Error(
              `unexpected fetch: ${url}`,
            );
          },
        );

        const result =
          await materializeOpportunityForEvent(
            event.id,
            env,
          );

        expect(result)
          .toEqual({
            status: "replay",
            opportunity_id:
              existingId,
          });
      },
    );

    it(
      "skips non-TradingView events",
      async () => {
        const eventId =
          crypto.randomUUID();

        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch",
          ).mockResolvedValueOnce(
            Response.json([
              {
                id:
                  eventId,
                environment:
                  "dev",
                event_type:
                  "system.heartbeat",
                event_version: 1,
                payload: {},
              },
            ]),
          );

        await expect(
          materializeOpportunityForEvent(
            eventId,
            env,
          ),
        ).resolves.toEqual({
          status: "skipped",
        });

        expect(fetchMock)
          .toHaveBeenCalledTimes(1);
      },
    );
  },
);

function queueMessage() {
  const eventId =
    crypto.randomUUID();

  const ack =
    vi.fn();

  const retry =
    vi.fn();

  const message:
    QueueMessageLike = {
      id:
        "queue-message-s04-2",
      body: {
        queue_contract_version: 1,
        event_id:
          eventId,
        environment:
          "dev",
      },
      ack,
      retry,
    };

  return {
    eventId,
    message,
    ack,
    retry,
  };
}

describe(
  "S04.2 queue integration",
  () => {
    it(
      "materializes the opportunity before marking processing succeeded",
      async () => {
        const {
          eventId,
          message,
          ack,
          retry,
        } = queueMessage();

        const order: string[] =
          [];

        const dependencies:
          QueueConsumerDependencies = {
            readCanonicalEvent:
              async () => ({
                status:
                  "found",
                event: {
                  id:
                    eventId,
                  environment:
                    "dev",
                },
              }),

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

            processOpportunity:
              async () => {
                order.push(
                  "opportunity",
                );

                return {
                  status:
                    "created",
                  opportunity_id:
                    crypto.randomUUID(),
                };
              },

            markSucceeded:
              async () => {
                order.push(
                  "succeeded",
                );

                return true;
              },

            recordFailure:
              async () => true,
          };

        await handleMainQueueMessage(
          message,
          env,
          dependencies,
        );

        expect(order).toEqual([
          "begin",
          "opportunity",
          "succeeded",
        ]);

        expect(ack)
          .toHaveBeenCalledOnce();

        expect(retry)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "records and retries opportunity-store failure without marking success",
      async () => {
        const {
          eventId,
          message,
          ack,
          retry,
        } = queueMessage();

        const markSucceeded =
          vi.fn(
            async () => true,
          );

        const recordFailure =
          vi.fn(
            async () => true,
          );

        const dependencies:
          QueueConsumerDependencies = {
            readCanonicalEvent:
              async () => ({
                status:
                  "found",
                event: {
                  id:
                    eventId,
                  environment:
                    "dev",
                },
              }),

            beginReceipt:
              async () => ({
                status:
                  "started",
                attempt_count: 1,
              }),

            processOpportunity:
              async () => ({
                status:
                  "unavailable",
              }),

            markSucceeded,

            recordFailure,
          };

        await handleMainQueueMessage(
          message,
          env,
          dependencies,
        );

        expect(
          recordFailure,
        ).toHaveBeenCalledWith(
          eventId,
          "dev",
          "queue-message-s04-2",
          "opportunity_store_unavailable",
          env,
        );

        expect(markSucceeded)
          .not.toHaveBeenCalled();

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

describe(
  "S04.2 upstream contract compatibility",
  () => {
    it(
      "accepts a TradingView strategy id containing hyphen and dot",
      async () => {
        const event =
          tradingViewEvent();

        event.payload.strategy_id =
          "failed-sfp.v1";

        let inserted:
          OpportunityInsert | null =
            null;

        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (
            input,
            init,
          ) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                event,
              ]);
            }

            if (
              url.pathname
                === "/rest/v1/opportunities"
              && init?.method
                === "POST"
            ) {
              inserted =
                JSON.parse(
                  String(
                    init.body,
                  ),
                ) as OpportunityInsert;

              return new Response(
                null,
                {
                  status: 201,
                },
              );
            }

            throw new Error(
              `unexpected fetch: ${url}`,
            );
          },
        );

        await expect(
          materializeOpportunityForEvent(
            event.id,
            env,
          ),
        ).resolves.toMatchObject({
          status: "created",
        });

        expect(
          inserted?.strategy_id,
        ).toBe(
          "failed-sfp.v1",
        );
      },
    );
  },
);

describe(
  "S04.2 completed-processing guard",
  () => {
    it(
      "does not materialize an opportunity again after processing already succeeded",
      async () => {
        const {
          eventId,
          message,
          ack,
          retry,
        } = queueMessage();

        const processOpportunity =
          vi.fn(
            async () => ({
              status:
                "created" as const,
              opportunity_id:
                crypto.randomUUID(),
            }),
          );

        const markSucceeded =
          vi.fn(
            async () => true,
          );

        const dependencies:
          QueueConsumerDependencies = {
            readCanonicalEvent:
              async () => ({
                status:
                  "found",
                event: {
                  id:
                    eventId,
                  environment:
                    "dev",
                },
              }),

            beginReceipt:
              async () => ({
                status:
                  "already_succeeded",
              }),

            processOpportunity,

            markSucceeded,

            recordFailure:
              async () => true,
          };

        await handleMainQueueMessage(
          message,
          env,
          dependencies,
        );

        expect(processOpportunity)
          .not.toHaveBeenCalled();

        expect(markSucceeded)
          .not.toHaveBeenCalled();

        expect(ack)
          .toHaveBeenCalledOnce();

        expect(retry)
          .not.toHaveBeenCalled();
      },
    );
  },
);
