import type {
  RuntimeEnv,
} from "./event-persistence";

const encoder =
  new TextEncoder();

export const TRADINGVIEW_WEBHOOK_PREFIX =
  "/api/webhooks/tradingview/";

type TradingViewRuntimeEnv =
  RuntimeEnv & {
    TRADINGVIEW_WEBHOOK_ROUTE_TOKEN?: string;
  };

export function isTradingViewWebhookRouteCandidate(
  pathname: string,
): boolean {
  return pathname.startsWith(
    TRADINGVIEW_WEBHOOK_PREFIX,
  );
}

function timingSafeStringEqual(
  supplied: string,
  expected: string,
): boolean {
  const suppliedBytes =
    encoder.encode(supplied);

  const expectedBytes =
    encoder.encode(expected);

  if (
    suppliedBytes.byteLength
    !== expectedBytes.byteLength
  ) {
    return false;
  }

  const subtle =
    crypto.subtle as SubtleCrypto & {
      timingSafeEqual(
        first: BufferSource,
        second: BufferSource,
      ): boolean;
    };

  return subtle.timingSafeEqual(
    suppliedBytes,
    expectedBytes,
  );
}

export function isAuthorizedTradingViewRoute(
  pathname: string,
  env: RuntimeEnv,
): boolean {
  if (
    !isTradingViewWebhookRouteCandidate(
      pathname,
    )
  ) {
    return false;
  }

  const token =
    pathname.slice(
      TRADINGVIEW_WEBHOOK_PREFIX.length,
    );

  const expected =
    (
      env as TradingViewRuntimeEnv
    ).TRADINGVIEW_WEBHOOK_ROUTE_TOKEN;

  if (
    token.length === 0
    || token.includes("/")
    || typeof expected !== "string"
    || expected.length < 32
  ) {
    return false;
  }

  return timingSafeStringEqual(
    token,
    expected,
  );
}
