import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTradingViewWebhookHandler,
} from "../worker/tradingview-webhook";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const ROUTE_TOKEN =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const env = {
  APP_ENV: "dev",
  APP_NAME:
    "trading-company-hq",
  SUPABASE_URL:
    "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "test-service-key",
  EVENT_INGRESS_TOKEN:
    "test-ingress-token",
  TRADINGVIEW_WEBHOOK_ROUTE_TOKEN:
    ROUTE_TOKEN,
  EVENT_QUEUE: {
    async send() {
      return;
    },
  },
} as unknown as RuntimeEnv;

function body(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    contract_version: 1,
    source: "tradingview",
    signal_type:
      "signal.detected",
    strategy_id:
      "htf_sfp_v1",
    strategy_version: 1,
    exchange: "CME",
    ticker: "ES1!",
    interval: "60",
    bar_time:
      "2026-09-14T08:00:00Z",
    triggered_at:
      new Date(
        Date.now() - 1000,
      ).toISOString(),
    payload: {
      test: true,
    },
    ...overrides,
  };
}

function request(
  payload: unknown,
  options?: {
    token?: string;
    method?: string;
    contentType?: string;
    raw?: string;
  },
): Request {
  const token =
    options?.token
    ?? ROUTE_TOKEN;

  const method =
    options?.method
    ?? "POST";

  return new Request(
    `https://example.com/api/webhooks/tradingview/${token}`,
    {
      method,
      headers: {
        "content-type":
          options?.contentType
          ?? "application/json",
      },
      body:
        method === "GET"
          ? undefined
          : (
              options?.raw
              ?? JSON.stringify(
                payload,
              )
            ),
    },
  );
}

describe(
  "S04.1 TradingView webhook",
  () => {
    it(
      "returns 404 for invalid route token",
      async () => {
        const persist =
          vi.fn();

        const dispatch =
          vi.fn();

        const handler =
          createTradingViewWebhookHandler(
            persist,
            dispatch,
          );

        const response =
          await handler(
            request(
              body(),
              {
                token:
                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ),
            env,
          );

        expect(
          response.status,
        ).toBe(404);

        expect(persist)
          .not.toHaveBeenCalled();

        expect(dispatch)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "accepts POST only",
      async () => {
        const handler =
          createTradingViewWebhookHandler(
            vi.fn(),
            vi.fn(),
          );

        const response =
          await handler(
            request(
              body(),
              {
                method: "GET",
              },
            ),
            env,
          );

        expect(
          response.status,
        ).toBe(405);
      },
    );

    it(
      "requires application/json",
      async () => {
        const handler =
          createTradingViewWebhookHandler(
            vi.fn(),
            vi.fn(),
          );

        const response =
          await handler(
            request(
              body(),
              {
                contentType:
                  "text/plain",
              },
            ),
            env,
          );

        expect(
          response.status,
        ).toBe(415);
      },
    );

    it(
      "rejects malformed JSON",
      async () => {
        const persist =
          vi.fn();

        const handler =
          createTradingViewWebhookHandler(
            persist,
            vi.fn(),
          );

        const response =
          await handler(
            request(
              body(),
              {
                raw: "{bad",
              },
            ),
            env,
          );

        expect(
          response.status,
        ).toBe(400);

        expect(persist)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "persists before dispatch and returns 202",
      async () => {
        const eventId =
          crypto.randomUUID();

        const requestId =
          crypto.randomUUID();

        const order:
          string[] = [];

        const persist =
          vi.fn(
            async () => {
              order.push(
                "persist",
              );

              return {
                status:
                  "created" as const,
                event_id:
                  eventId,
                request_id:
                  requestId,
              };
            },
          );

        const dispatch =
          vi.fn(
            async () => {
              order.push(
                "dispatch",
              );

              return true;
            },
          );

        const handler =
          createTradingViewWebhookHandler(
            persist,
            dispatch,
          );

        const response =
          await handler(
            request(body()),
            env,
          );

        expect(order).toEqual([
          "persist",
          "dispatch",
        ]);

        expect(
          response.status,
        ).toBe(202);

        const inserted =
          persist.mock.calls[0][0];

        expect(
          inserted.event_type,
        ).toBe(
          "tradingview.signal",
        );

        expect(
          inserted
            .request_body_sha256,
        ).toMatch(
          /^[0-9a-f]{64}$/,
        );

        expect(
          inserted
            .idempotency_key_sha256,
        ).toMatch(
          /^[0-9a-f]{64}$/,
        );
      },
    );

    it(
      "returns 503 when persistence fails",
      async () => {
        const dispatch =
          vi.fn();

        const handler =
          createTradingViewWebhookHandler(
            async () => ({
              status:
                "unavailable",
            }),
            dispatch,
          );

        const response =
          await handler(
            request(body()),
            env,
          );

        expect(
          response.status,
        ).toBe(503);

        expect(dispatch)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "returns 503 when dispatch fails",
      async () => {
        const handler =
          createTradingViewWebhookHandler(
            async () => ({
              status:
                "created",
              event_id:
                crypto.randomUUID(),
              request_id:
                crypto.randomUUID(),
            }),
            async () => false,
          );

        const response =
          await handler(
            request(body()),
            env,
          );

        expect(
          response.status,
        ).toBe(503);
      },
    );
  },
);
