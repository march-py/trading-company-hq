import {
  readFile,
} from "node:fs/promises";

const root =
  new URL(
    "../",
    import.meta.url,
  );

const read = (path) =>
  readFile(
    new URL(path, root),
    "utf8",
  );

const [
  index,
  auth,
  payload,
  webhook,
  docs,
] = await Promise.all([
  read("worker/index.ts"),
  read("worker/tradingview-auth.ts"),
  read("worker/tradingview-payload.ts"),
  read("worker/tradingview-webhook.ts"),
  read("docs/s04-1-pine-webhook-contract.md"),
]);

function requireMatch(
  text,
  pattern,
  message,
) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

function forbidMatch(
  text,
  pattern,
  message,
) {
  if (pattern.test(text)) {
    throw new Error(message);
  }
}

requireMatch(
  index,
  /createTradingViewWebhookHandler/,
  "TradingView handler is not connected",
);

requireMatch(
  index,
  /isTradingViewWebhookRouteCandidate/,
  "TradingView route matcher missing",
);

requireMatch(
  auth,
  /\/api\/webhooks\/tradingview\//,
  "TradingView route prefix missing",
);

requireMatch(
  auth,
  /timingSafeEqual/,
  "constant-time route-token comparison missing",
);

requireMatch(
  payload,
  /event_type:\s*"tradingview\.signal"/,
  "TradingView event normalization missing",
);

requireMatch(
  webhook,
  /MAX_EVENT_BODY_BYTES/,
  "existing body-size boundary not reused",
);

requireMatch(
  webhook,
  /tv:\$\{rawBodySha256\}/,
  "synthetic idempotency key missing",
);

requireMatch(
  docs,
  /\{\{exchange\}\}/,
  "TradingView alert template missing",
);

requireMatch(
  docs,
  /No opportunity lifecycle/i,
  "S04.2 scope exclusion missing",
);

forbidMatch(
  auth + payload + webhook + docs,
  /opportunity_id/,
  "S04.1 must not introduce opportunity_id",
);

console.log(
  "S04.1 Pine/webhook static contract passed",
);
