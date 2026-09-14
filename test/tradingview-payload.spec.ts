import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateTradingViewPayload,
} from "../worker/tradingview-payload";

const NOW =
  Date.parse(
    "2026-09-14T08:10:00.000Z",
  );

function validPayload() {
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
      "2026-09-14T08:05:00Z",
    direction: "long",
    price: 6600.25,
    payload: {
      sweep: true,
    },
  };
}

describe(
  "S04.1 TradingView payload",
  () => {
    it(
      "accepts and normalizes valid V1 payload",
      () => {
        const result =
          validateTradingViewPayload(
            validPayload(),
            NOW,
          );

        expect(result.ok)
          .toBe(true);

        if (!result.ok) {
          return;
        }

        expect(
          result.envelope.event_type,
        ).toBe(
          "tradingview.signal",
        );

        expect(
          result.envelope.occurred_at,
        ).toBe(
          "2026-09-14T08:05:00.000Z",
        );
      },
    );

    it(
      "rejects unsupported contract version",
      () => {
        expect(
          validateTradingViewPayload(
            {
              ...validPayload(),
              contract_version: 2,
            },
            NOW,
          ),
        ).toEqual({
          ok: false,
          reason:
            "unsupported_contract",
        });
      },
    );

    it(
      "rejects unexpected root fields",
      () => {
        expect(
          validateTradingViewPayload(
            {
              ...validPayload(),
              unexpected: true,
            },
            NOW,
          ).ok,
        ).toBe(false);
      },
    );

    it(
      "rejects malformed source",
      () => {
        expect(
          validateTradingViewPayload(
            {
              ...validPayload(),
              source: "other",
            },
            NOW,
          ).ok,
        ).toBe(false);
      },
    );

    it(
      "rejects future timestamps beyond tolerance",
      () => {
        expect(
          validateTradingViewPayload(
            {
              ...validPayload(),
              triggered_at:
                "2026-09-14T08:16:00Z",
            },
            NOW,
          ).ok,
        ).toBe(false);
      },
    );
  },
);
