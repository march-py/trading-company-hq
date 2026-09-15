import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createOpportunityApiHandler,
} from "../worker/opportunity-api";

import {
  reconcileOpportunities,
  type ReconciliationReport,
} from "../worker/opportunity-reconciliation";

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

const eventA =
  "11111111-1111-4111-8111-111111111111";

const eventB =
  "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.restoreAllMocks();
});

describe(
  "S04.3 reconciliation store",
  () => {
    it(
      "detects a durable TradingView event with no opportunity",
      async () => {
        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch",
          ).mockImplementation(
            async (input) => {
              const url =
                new URL(
                  String(input),
                );

              if (
                url.pathname
                === "/rest/v1/event_ledger"
              ) {
                expect(
                  url.searchParams.get(
                    "environment",
                  ),
                ).toBe("eq.dev");

                expect(
                  url.searchParams.get(
                    "event_type",
                  ),
                ).toBe(
                  "eq.tradingview.signal",
                );

                expect(
                  url.searchParams.get(
                    "ingested_at",
                  ),
                ).toMatch(
                  /^gte\./,
                );

                expect(
                  url.searchParams.get(
                    "order",
                  ),
                ).toBe(
                  "ingested_at.desc,id.desc",
                );

                expect(
                  url.searchParams.get(
                    "limit",
                  ),
                ).toBe("3");

                return Response.json([
                  {
                    id:
                      eventA,
                    ingested_at:
                      "2026-09-15T10:00:00.000Z",
                  },
                  {
                    id:
                      eventB,
                    ingested_at:
                      "2026-09-15T09:00:00.000Z",
                  },
                ]);
              }

              if (
                url.pathname
                === "/rest/v1/opportunities"
              ) {
                expect(
                  url.searchParams.get(
                    "environment",
                  ),
                ).toBe("eq.dev");

                expect(
                  url.searchParams.get(
                    "source_event_id",
                  ),
                ).toContain(
                  "in.(",
                );

                return Response.json([
                  {
                    source_event_id:
                      eventA,
                  },
                ]);
              }

              throw new Error(
                `unexpected fetch ${url}`,
              );
            },
          );

        const dispatch =
          vi.fn(
            async () => true,
          );

        const result =
          await reconcileOpportunities(
            {
              mode:
                "dry_run",
              lookback_hours: 24,
              limit: 2,
            },
            env,
            dispatch,
          );

        expect(fetchMock)
          .toHaveBeenCalledTimes(2);

        expect(dispatch)
          .not.toHaveBeenCalled();

        expect(result)
          .toEqual({
            status: "ok",
            report: {
              mode:
                "dry_run",
              lookback_hours: 24,
              limit: 2,
              scanned_count: 2,
              missing_count: 1,
              missing_event_ids: [
                eventB,
              ],
              truncated:
                false,
              redispatched_count: 0,
            },
          });
      },
    );

    it(
      "marks a bounded scan as truncated",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (input) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                {
                  id:
                    eventA,
                  ingested_at:
                    "2026-09-15T10:00:00.000Z",
                },
                {
                  id:
                    eventB,
                  ingested_at:
                    "2026-09-15T09:00:00.000Z",
                },
              ]);
            }

            return Response.json([]);
          },
        );

        const result =
          await reconcileOpportunities(
            {
              mode:
                "dry_run",
              lookback_hours: 24,
              limit: 1,
            },
            env,
          );

        expect(result.status)
          .toBe("ok");

        if (
          result.status !== "ok"
        ) {
          throw new Error(
            "expected ok result",
          );
        }

        expect(
          result.report
            .scanned_count,
        ).toBe(1);

        expect(
          result.report.truncated,
        ).toBe(true);
      },
    );

    it(
      "repairs only by redispatching missing events through the queue contract",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (input) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                {
                  id:
                    eventA,
                  ingested_at:
                    "2026-09-15T10:00:00.000Z",
                },
              ]);
            }

            if (
              url.pathname
              === "/rest/v1/opportunities"
            ) {
              return Response.json([]);
            }

            throw new Error(
              `unexpected fetch ${url}`,
            );
          },
        );

        const dispatch =
          vi.fn(
            async () => true,
          );

        const result =
          await reconcileOpportunities(
            {
              mode:
                "repair",
              lookback_hours: 12,
              limit: 100,
            },
            env,
            dispatch,
          );

        expect(dispatch)
          .toHaveBeenCalledOnce();

        expect(dispatch)
          .toHaveBeenCalledWith(
            eventA,
            "dev",
            env,
          );

        expect(result)
          .toEqual({
            status: "ok",
            report: {
              mode:
                "repair",
              lookback_hours: 12,
              limit: 100,
              scanned_count: 1,
              missing_count: 1,
              missing_event_ids: [
                eventA,
              ],
              truncated:
                false,
              redispatched_count: 1,
            },
          });
      },
    );

    it(
      "reports queue redispatch failure without creating a second repair path",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockImplementation(
          async (input) => {
            const url =
              new URL(
                String(input),
              );

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                {
                  id:
                    eventA,
                  ingested_at:
                    "2026-09-15T10:00:00.000Z",
                },
              ]);
            }

            return Response.json([]);
          },
        );

        const dispatch =
          vi.fn(
            async () => false,
          );

        const result =
          await reconcileOpportunities(
            {
              mode:
                "repair",
              lookback_hours: 24,
              limit: 100,
            },
            env,
            dispatch,
          );

        expect(result.status)
          .toBe(
            "repair_failed",
          );

        if (
          result.status
          !== "repair_failed"
        ) {
          throw new Error(
            "expected repair failure",
          );
        }

        expect(
          result.failed_event_ids,
        ).toEqual([
          eventA,
        ]);

        expect(
          result.report
            .redispatched_count,
        ).toBe(0);
      },
    );
  },
);

describe(
  "S04.3 reconciliation API",
  () => {
    function dependencies(
      reconcile:
        (
          input: {
            mode:
              | "dry_run"
              | "repair";
            lookback_hours:
              number;
            limit: number;
          },
          runtime:
            RuntimeEnv,
        ) => Promise<
          | {
              status: "ok";
              report:
                ReconciliationReport;
            }
          | {
              status:
                "unavailable";
            }
        >,
    ) {
      return {
        list:
          async () => ({
            status:
              "ok" as const,
            items: [],
            next_cursor:
              null,
          }),

        detail:
          async () => ({
            status:
              "missing" as const,
          }),

        reconcile,
      };
    }

    it(
      "applies safe reconciliation defaults",
      async () => {
        const reconcile =
          vi.fn(
            async (input) => ({
              status:
                "ok" as const,
              report: {
                ...input,
                scanned_count: 0,
                missing_count: 0,
                missing_event_ids: [],
                truncated:
                  false,
                redispatched_count: 0,
              },
            }),
          );

        const handler =
          createOpportunityApiHandler(
            dependencies(
              reconcile,
            ),
          );

        const response =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    mode:
                      "dry_run",
                  }),
              },
            ),
            env,
          );

        expect(response.status)
          .toBe(200);

        expect(reconcile)
          .toHaveBeenCalledWith(
            {
              mode:
                "dry_run",
              lookback_hours: 24,
              limit: 100,
            },
            env,
          );

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toBe("no-store");
      },
    );

    it(
      "rejects invalid and unknown request fields",
      async () => {
        const reconcile =
          vi.fn();

        const handler =
          createOpportunityApiHandler(
            dependencies(
              reconcile,
            ),
          );

        const invalidMode =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    mode:
                      "unknown",
                  }),
              },
            ),
            env,
          );

        const unknownField =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    mode:
                      "dry_run",
                    unexpected:
                      true,
                  }),
              },
            ),
            env,
          );

        const badBounds =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    mode:
                      "dry_run",
                    lookback_hours:
                      169,
                    limit:
                      501,
                  }),
              },
            ),
            env,
          );

        expect(
          invalidMode.status,
        ).toBe(400);

        expect(
          unknownField.status,
        ).toBe(400);

        expect(
          badBounds.status,
        ).toBe(400);

        expect(reconcile)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "requires JSON and POST",
      async () => {
        const reconcile =
          vi.fn();

        const handler =
          createOpportunityApiHandler(
            dependencies(
              reconcile,
            ),
          );

        const wrongMethod =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
            ),
            env,
          );

        const wrongType =
          await handler(
            new Request(
              "https://example.com/api/opportunities/reconcile",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "text/plain",
                },
                body:
                  "{}",
              },
            ),
            env,
          );

        expect(
          wrongMethod.status,
        ).toBe(405);

        expect(
          wrongMethod.headers.get(
            "allow",
          ),
        ).toBe("POST");

        expect(
          wrongType.status,
        ).toBe(415);

        expect(reconcile)
          .not.toHaveBeenCalled();
      },
    );
  },
);
