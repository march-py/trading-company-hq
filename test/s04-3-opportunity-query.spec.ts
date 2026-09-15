import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  decodeOpportunityCursor,
  getOpportunityDetail,
  listOpportunities,
  type OpportunitySummary,
} from "../worker/opportunity-query";

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

function opportunity(
  id: string,
  sourceEventId: string,
  createdAt: string,
): OpportunitySummary {
  return {
    id,
    environment:
      "dev",
    source_event_id:
      sourceEventId,
    status:
      "detected",
    strategy_id:
      "failed-sfp.v1",
    strategy_version: 1,
    exchange:
      "BINANCE",
    ticker:
      "BTCUSDT",
    interval:
      "12H",
    triggered_at:
      createdAt,
    direction:
      "long",
    setup_key:
      "failed_sfp",
    tradingview_deep_link:
      "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT",
    detected_at:
      createdAt,
    qualified_at:
      null,
    alerted_at:
      null,
    seen_at:
      null,
    created_at:
      createdAt,
    updated_at:
      createdAt,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe(
  "S04.3 opportunity query store",
  () => {
    it(
      "lists environment-scoped opportunities with stable pagination",
      async () => {
        const row1 =
          opportunity(
            "11111111-1111-4111-8111-111111111111",
            "21111111-1111-4111-8111-111111111111",
            "2026-09-15T10:03:00.000Z",
          );

        const row2 =
          opportunity(
            "12222222-2222-4222-8222-222222222222",
            "22222222-2222-4222-8222-222222222222",
            "2026-09-15T10:02:00.000Z",
          );

        const row3 =
          opportunity(
            "13333333-3333-4333-8333-333333333333",
            "23333333-3333-4333-8333-333333333333",
            "2026-09-15T10:01:00.000Z",
          );

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

              expect(
                url.pathname,
              ).toBe(
                "/rest/v1/opportunities",
              );

              expect(
                url.searchParams.get(
                  "environment",
                ),
              ).toBe("eq.dev");

              expect(
                url.searchParams.get(
                  "status",
                ),
              ).toBe(
                "eq.detected",
              );

              expect(
                url.searchParams.get(
                  "strategy_id",
                ),
              ).toBe(
                "eq.failed-sfp.v1",
              );

              expect(
                url.searchParams.get(
                  "ticker",
                ),
              ).toBe(
                "eq.BTCUSDT",
              );

              expect(
                url.searchParams.get(
                  "order",
                ),
              ).toBe(
                "created_at.desc,id.desc",
              );

              expect(
                url.searchParams.get(
                  "limit",
                ),
              ).toBe("3");

              return Response.json([
                row1,
                row2,
                row3,
              ]);
            },
          );

        const result =
          await listOpportunities(
            {
              status:
                "detected",
              strategy_id:
                "failed-sfp.v1",
              ticker:
                "BTCUSDT",
              limit: 2,
            },
            env,
          );

        expect(fetchMock)
          .toHaveBeenCalledOnce();

        expect(result.status)
          .toBe("ok");

        if (
          result.status !== "ok"
        ) {
          throw new Error(
            "expected list result",
          );
        }

        expect(result.items)
          .toEqual([
            row1,
            row2,
          ]);

        expect(
          result.next_cursor,
        ).not.toBeNull();

        expect(
          decodeOpportunityCursor(
            result.next_cursor
              ?? "",
          ),
        ).toEqual({
          created_at:
            row2.created_at,
          id:
            row2.id,
        });
      },
    );

    it(
      "returns detail with transition and source-event traceability",
      async () => {
        const row =
          opportunity(
            "14444444-4444-4444-8444-444444444444",
            "24444444-4444-4444-8444-444444444444",
            "2026-09-15T10:00:00.000Z",
          );

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
              === "/rest/v1/opportunities"
            ) {
              return Response.json([
                row,
              ]);
            }

            if (
              url.pathname
              === "/rest/v1/opportunity_transitions"
            ) {
              return Response.json([
                {
                  id:
                    "34444444-4444-4444-8444-444444444444",
                  opportunity_id:
                    row.id,
                  environment:
                    "dev",
                  from_status:
                    null,
                  to_status:
                    "detected",
                  transitioned_at:
                    row.detected_at,
                  reason_code:
                    null,
                },
              ]);
            }

            if (
              url.pathname
              === "/rest/v1/event_ledger"
            ) {
              return Response.json([
                {
                  id:
                    row.source_event_id,
                  event_type:
                    "tradingview.signal",
                  event_version: 1,
                  ingested_at:
                    "2026-09-15T09:59:59.000Z",
                  request_id:
                    "44444444-4444-4444-8444-444444444444",
                  correlation_id:
                    "54444444-4444-4444-8444-444444444444",
                },
              ]);
            }

            throw new Error(
              `unexpected fetch ${url}`,
            );
          },
        );

        const result =
          await getOpportunityDetail(
            row.id,
            env,
          );

        expect(result.status)
          .toBe("found");

        if (
          result.status !== "found"
        ) {
          throw new Error(
            "expected detail result",
          );
        }

        expect(
          result.detail
            .opportunity,
        ).toEqual(row);

        expect(
          result.detail
            .transitions,
        ).toHaveLength(1);

        expect(
          result.detail
            .source_event
            .event_type,
        ).toBe(
          "tradingview.signal",
        );
      },
    );

    it(
      "returns missing for an unknown opportunity",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValueOnce(
          Response.json([]),
        );

        await expect(
          getOpportunityDetail(
            "15555555-5555-4555-8555-555555555555",
            env,
          ),
        ).resolves.toEqual({
          status: "missing",
        });
      },
    );

    it(
      "fails closed on malformed storage data",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValueOnce(
          Response.json([
            {
              id:
                "not-a-uuid",
            },
          ]),
        );

        await expect(
          listOpportunities(
            {
              limit: 50,
            },
            env,
          ),
        ).resolves.toEqual({
          status:
            "unavailable",
        });
      },
    );
  },
);
