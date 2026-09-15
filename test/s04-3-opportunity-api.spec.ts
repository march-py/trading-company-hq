import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createOpportunityApiHandler,
} from "../worker/opportunity-api";

import {
  decodeOpportunityCursor,
  encodeOpportunityCursor,
  type OpportunityDetail,
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

const opportunity:
  OpportunitySummary = {
    id:
      "11111111-1111-4111-8111-111111111111",
    environment:
      "dev",
    source_event_id:
      "22222222-2222-4222-8222-222222222222",
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
      "2026-09-15T10:00:00.000Z",
    direction:
      "long",
    setup_key:
      "failed_sfp",
    tradingview_deep_link:
      "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT",
    detected_at:
      "2026-09-15T10:00:01.000Z",
    qualified_at:
      null,
    alerted_at:
      null,
    seen_at:
      null,
    created_at:
      "2026-09-15T10:00:01.000Z",
    updated_at:
      "2026-09-15T10:00:01.000Z",
  };

const detail:
  OpportunityDetail = {
    opportunity,
    transitions: [
      {
        id:
          "33333333-3333-4333-8333-333333333333",
        opportunity_id:
          opportunity.id,
        environment:
          "dev",
        from_status:
          null,
        to_status:
          "detected",
        transitioned_at:
          opportunity.detected_at,
        reason_code:
          null,
      },
    ],
    source_event: {
      id:
        opportunity.source_event_id,
      event_type:
        "tradingview.signal",
      event_version: 1,
      ingested_at:
        "2026-09-15T10:00:00.500Z",
      request_id:
        "44444444-4444-4444-8444-444444444444",
      correlation_id:
        "55555555-5555-4555-8555-555555555555",
    },
  };

describe(
  "S04.3 opportunity API",
  () => {
    it(
      "parses a bounded filtered list request",
      async () => {
        const list =
          vi.fn(
            async () => ({
              status:
                "ok" as const,
              items: [
                opportunity,
              ],
              next_cursor:
                "next-page",
            }),
          );

        const handler =
          createOpportunityApiHandler({
            list,
            detail:
              async () => ({
                status:
                  "missing",
              }),
          });

        const response =
          await handler(
            new Request(
              "https://example.com/api/opportunities?status=detected&strategy_id=failed-sfp.v1&ticker=BTCUSDT&limit=25",
            ),
            env,
          );

        expect(response.status)
          .toBe(200);

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toBe("no-store");

        expect(list)
          .toHaveBeenCalledWith(
            {
              status:
                "detected",
              strategy_id:
                "failed-sfp.v1",
              ticker:
                "BTCUSDT",
              limit: 25,
            },
            env,
          );

        await expect(
          response.json(),
        ).resolves.toEqual({
          items: [
            opportunity,
          ],
          next_cursor:
            "next-page",
        });
      },
    );

    it(
      "rejects unknown or invalid list parameters",
      async () => {
        const list =
          vi.fn(
            async () => ({
              status:
                "ok" as const,
              items: [],
              next_cursor:
                null,
            }),
          );

        const handler =
          createOpportunityApiHandler({
            list,
            detail:
              async () => ({
                status:
                  "missing",
              }),
          });

        const unknown =
          await handler(
            new Request(
              "https://example.com/api/opportunities?unknown=yes",
            ),
            env,
          );

        const badLimit =
          await handler(
            new Request(
              "https://example.com/api/opportunities?limit=101",
            ),
            env,
          );

        const badStatus =
          await handler(
            new Request(
              "https://example.com/api/opportunities?status=closed",
            ),
            env,
          );

        expect(unknown.status)
          .toBe(400);

        expect(badLimit.status)
          .toBe(400);

        expect(badStatus.status)
          .toBe(400);

        expect(list)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "returns one opportunity detail with traceability",
      async () => {
        const detailReader =
          vi.fn(
            async () => ({
              status:
                "found" as const,
              detail,
            }),
          );

        const handler =
          createOpportunityApiHandler({
            list:
              async () => ({
                status:
                  "ok",
                items: [],
                next_cursor:
                  null,
              }),
            detail:
              detailReader,
          });

        const response =
          await handler(
            new Request(
              `https://example.com/api/opportunities/${opportunity.id}`,
            ),
            env,
          );

        expect(response.status)
          .toBe(200);

        expect(detailReader)
          .toHaveBeenCalledWith(
            opportunity.id,
            env,
          );

        await expect(
          response.json(),
        ).resolves.toEqual(
          detail,
        );
      },
    );

    it(
      "rejects an invalid opportunity id",
      async () => {
        const detailReader =
          vi.fn();

        const handler =
          createOpportunityApiHandler({
            list:
              async () => ({
                status:
                  "ok",
                items: [],
                next_cursor:
                  null,
              }),
            detail:
              detailReader,
          });

        const response =
          await handler(
            new Request(
              "https://example.com/api/opportunities/not-a-uuid",
            ),
            env,
          );

        expect(response.status)
          .toBe(400);

        expect(detailReader)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "maps missing and unavailable dependencies safely",
      async () => {
        const missing =
          createOpportunityApiHandler({
            list:
              async () => ({
                status:
                  "ok",
                items: [],
                next_cursor:
                  null,
              }),
            detail:
              async () => ({
                status:
                  "missing",
              }),
          });

        const unavailable =
          createOpportunityApiHandler({
            list:
              async () => ({
                status:
                  "unavailable",
              }),
            detail:
              async () => ({
                status:
                  "unavailable",
              }),
          });

        const missingResponse =
          await missing(
            new Request(
              `https://example.com/api/opportunities/${opportunity.id}`,
            ),
            env,
          );

        const unavailableResponse =
          await unavailable(
            new Request(
              "https://example.com/api/opportunities",
            ),
            env,
          );

        expect(
          missingResponse.status,
        ).toBe(404);

        expect(
          unavailableResponse.status,
        ).toBe(503);

        await expect(
          unavailableResponse.json(),
        ).resolves.toEqual({
          error:
            "opportunity_store_unavailable",
        });
      },
    );

    it(
      "keeps opportunity routes GET-only in checkpoint A",
      async () => {
        const handler =
          createOpportunityApiHandler({
            list:
              async () => ({
                status:
                  "ok",
                items: [],
                next_cursor:
                  null,
              }),
            detail:
              async () => ({
                status:
                  "missing",
              }),
          });

        const response =
          await handler(
            new Request(
              "https://example.com/api/opportunities",
              {
                method:
                  "POST",
              },
            ),
            env,
          );

        expect(response.status)
          .toBe(405);

        expect(
          response.headers.get(
            "allow",
          ),
        ).toBe("GET");
      },
    );
  },
);

describe(
  "S04.3 opportunity cursor",
  () => {
    it(
      "round-trips an opaque cursor",
      () => {
        const cursor = {
          created_at:
            "2026-09-15T10:00:01.000Z",
          id:
            opportunity.id,
        };

        const encoded =
          encodeOpportunityCursor(
            cursor,
          );

        expect(encoded)
          .toMatch(
            /^[A-Za-z0-9_-]+$/,
          );

        expect(
          decodeOpportunityCursor(
            encoded,
          ),
        ).toEqual(
          cursor,
        );
      },
    );

    it(
      "rejects malformed cursors",
      () => {
        expect(
          decodeOpportunityCursor(
            "%%%",
          ),
        ).toBeNull();
      },
    );
  },
);
