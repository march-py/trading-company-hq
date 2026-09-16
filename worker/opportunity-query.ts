import type {
  RuntimeEnv,
} from "./event-persistence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpportunityStatus =
  | "detected"
  | "qualified"
  | "alerted"
  | "seen";

export interface OpportunityCursor {
  created_at: string;
  id: string;
}

export interface OpportunitySummary {
  id: string;
  environment:
    RuntimeEnv["APP_ENV"];
  source_event_id: string;
  instrument_id: string;
  venue_instrument_id: string | null;
  status: OpportunityStatus;
  strategy_id: string;
  strategy_version: number;
  exchange: string;
  ticker: string;
  interval: string;
  triggered_at: string;
  direction:
    | "long"
    | "short"
    | "neutral"
    | null;
  setup_key: string | null;
  tradingview_deep_link: string;
  detected_at: string;
  qualified_at: string | null;
  alerted_at: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityTransition {
  id: string;
  opportunity_id: string;
  environment:
    RuntimeEnv["APP_ENV"];
  from_status:
    OpportunityStatus | null;
  to_status:
    OpportunityStatus;
  transitioned_at: string;
  reason_code: string | null;
}

export interface OpportunitySourceEvent {
  id: string;
  event_type: string;
  event_version: number;
  ingested_at: string;
  request_id: string;
  correlation_id: string;
}

export interface OpportunityDetail {
  opportunity:
    OpportunitySummary;
  transitions:
    OpportunityTransition[];
  source_event:
    OpportunitySourceEvent;
}

export interface OpportunityListInput {
  status?: OpportunityStatus;
  strategy_id?: string;
  ticker?: string;
  limit: number;
  cursor?: OpportunityCursor;
}

export type OpportunityListResult =
  | {
      status: "ok";
      items:
        OpportunitySummary[];
      next_cursor:
        string | null;
    }
  | {
      status: "unavailable";
    };

export type OpportunityDetailResult =
  | {
      status: "found";
      detail:
        OpportunityDetail;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    };

function runtimeHeaders(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey:
      env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isEnvironment(
  value: unknown,
): value is RuntimeEnv["APP_ENV"] {
  return (
    value === "dev"
    || value === "prod"
  );
}

export function isOpportunityStatus(
  value: unknown,
): value is OpportunityStatus {
  return (
    value === "detected"
    || value === "qualified"
    || value === "alerted"
    || value === "seen"
  );
}

function isInstant(
  value: unknown,
): value is string {
  return (
    typeof value === "string"
    && Number.isFinite(
      Date.parse(value),
    )
  );
}

function isOptionalInstant(
  value: unknown,
): value is string | null {
  return (
    value === null
    || isInstant(value)
  );
}

function isDirection(
  value: unknown,
): value is
  | "long"
  | "short"
  | "neutral"
  | null {
  return (
    value === null
    || value === "long"
    || value === "short"
    || value === "neutral"
  );
}

function isOpportunitySummary(
  value: unknown,
): value is OpportunitySummary {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && isEnvironment(
      value.environment,
    )
    && typeof value.source_event_id
      === "string"
    && UUID_PATTERN.test(
      value.source_event_id,
    )
    && typeof value.instrument_id
      === "string"
    && UUID_PATTERN.test(
      value.instrument_id,
    )
    && (
      value.venue_instrument_id === null
      || (
        typeof value.venue_instrument_id
          === "string"
        && UUID_PATTERN.test(
          value.venue_instrument_id,
        )
      )
    )
    && isOpportunityStatus(
      value.status,
    )
    && typeof value.strategy_id
      === "string"
    && Number.isInteger(
      value.strategy_version,
    )
    && typeof value.exchange
      === "string"
    && typeof value.ticker
      === "string"
    && typeof value.interval
      === "string"
    && isInstant(
      value.triggered_at,
    )
    && isDirection(
      value.direction,
    )
    && (
      value.setup_key === null
      || typeof value.setup_key
        === "string"
    )
    && typeof value.tradingview_deep_link
      === "string"
    && isInstant(
      value.detected_at,
    )
    && isOptionalInstant(
      value.qualified_at,
    )
    && isOptionalInstant(
      value.alerted_at,
    )
    && isOptionalInstant(
      value.seen_at,
    )
    && isInstant(
      value.created_at,
    )
    && isInstant(
      value.updated_at,
    )
  );
}

function isOpportunityTransition(
  value: unknown,
): value is OpportunityTransition {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.opportunity_id
      === "string"
    && UUID_PATTERN.test(
      value.opportunity_id,
    )
    && isEnvironment(
      value.environment,
    )
    && (
      value.from_status === null
      || isOpportunityStatus(
        value.from_status,
      )
    )
    && isOpportunityStatus(
      value.to_status,
    )
    && isInstant(
      value.transitioned_at,
    )
    && (
      value.reason_code === null
      || typeof value.reason_code
        === "string"
    )
  );
}

function isSourceEvent(
  value: unknown,
): value is OpportunitySourceEvent {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.event_type
      === "string"
    && Number.isInteger(
      value.event_version,
    )
    && isInstant(
      value.ingested_at,
    )
    && typeof value.request_id
      === "string"
    && UUID_PATTERN.test(
      value.request_id,
    )
    && typeof value.correlation_id
      === "string"
    && UUID_PATTERN.test(
      value.correlation_id,
    )
  );
}

function base64UrlEncode(
  value: string,
): string {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(
  value: string,
): string | null {
  if (
    value.length === 0
    || value.length > 512
    || !/^[A-Za-z0-9_-]+$/.test(
      value,
    )
  ) {
    return null;
  }

  let normalized =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    normalized.length % 4 !== 0
  ) {
    normalized += "=";
  }

  try {
    return atob(normalized);
  } catch {
    return null;
  }
}

export function encodeOpportunityCursor(
  cursor: OpportunityCursor,
): string {
  return base64UrlEncode(
    JSON.stringify({
      created_at:
        cursor.created_at,
      id:
        cursor.id,
    }),
  );
}

export function decodeOpportunityCursor(
  value: string,
): OpportunityCursor | null {
  const decoded =
    base64UrlDecode(value);

  if (decoded === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!isObject(parsed)) {
    return null;
  }

  if (
    !isInstant(
      parsed.created_at,
    )
    || typeof parsed.id
      !== "string"
    || !UUID_PATTERN.test(
      parsed.id,
    )
  ) {
    return null;
  }

  return {
    created_at:
      new Date(
        parsed.created_at,
      ).toISOString(),
    id:
      parsed.id,
  };
}

const OPPORTUNITY_SELECT = [
  "id",
  "environment",
  "source_event_id",
  "instrument_id",
  "venue_instrument_id",
  "status",
  "strategy_id",
  "strategy_version",
  "exchange",
  "ticker",
  "interval",
  "triggered_at",
  "direction",
  "setup_key",
  "tradingview_deep_link",
  "detected_at",
  "qualified_at",
  "alerted_at",
  "seen_at",
  "created_at",
  "updated_at",
].join(",");

export async function listOpportunities(
  input: OpportunityListInput,
  env: RuntimeEnv,
): Promise<OpportunityListResult> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/opportunities",
        env.SUPABASE_URL,
      );
  } catch {
    return {
      status: "unavailable",
    };
  }

  endpoint.searchParams.set(
    "select",
    OPPORTUNITY_SELECT,
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  if (
    input.status !== undefined
  ) {
    endpoint.searchParams.set(
      "status",
      `eq.${input.status}`,
    );
  }

  if (
    input.strategy_id
    !== undefined
  ) {
    endpoint.searchParams.set(
      "strategy_id",
      `eq.${input.strategy_id}`,
    );
  }

  if (
    input.ticker !== undefined
  ) {
    endpoint.searchParams.set(
      "ticker",
      `eq.${input.ticker}`,
    );
  }

  if (
    input.cursor !== undefined
  ) {
    endpoint.searchParams.set(
      "or",
      [
        "(",
        `created_at.lt.${input.cursor.created_at}`,
        ",and(",
        `created_at.eq.${input.cursor.created_at}`,
        ",",
        `id.lt.${input.cursor.id}`,
        "))",
      ].join(""),
    );
  }

  endpoint.searchParams.set(
    "order",
    "created_at.desc,id.desc",
  );

  endpoint.searchParams.set(
    "limit",
    String(
      input.limit + 1,
    ),
  );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "GET",
          headers:
            runtimeHeaders(env),
        },
      );

    if (response.status !== 200) {
      return {
        status: "unavailable",
      };
    }

    const decoded: unknown =
      await response.json();

    if (!Array.isArray(decoded)) {
      return {
        status: "unavailable",
      };
    }

    const rows:
      OpportunitySummary[] = [];

    for (
      const item
      of decoded
    ) {
      if (
        !isOpportunitySummary(
          item,
        )
      ) {
        return {
          status: "unavailable",
        };
      }

      rows.push(item);
    }

    const hasMore =
      rows.length > input.limit;

    const items =
      rows.slice(
        0,
        input.limit,
      );

    let nextCursor:
      string | null = null;

    if (
      hasMore
      && items.length > 0
    ) {
      const last =
        items[
          items.length - 1
        ];

      nextCursor =
        encodeOpportunityCursor({
          created_at:
            last.created_at,
          id:
            last.id,
        });
    }

    return {
      status: "ok",
      items,
      next_cursor:
        nextCursor,
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

async function readSingleOpportunity(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<
  | {
      status: "found";
      opportunity:
        OpportunitySummary;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    }
> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/opportunities",
        env.SUPABASE_URL,
      );
  } catch {
    return {
      status: "unavailable",
    };
  }

  endpoint.searchParams.set(
    "select",
    OPPORTUNITY_SELECT,
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  endpoint.searchParams.set(
    "id",
    `eq.${opportunityId}`,
  );

  endpoint.searchParams.set(
    "limit",
    "1",
  );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "GET",
          headers:
            runtimeHeaders(env),
        },
      );

    if (response.status !== 200) {
      return {
        status: "unavailable",
      };
    }

    const decoded: unknown =
      await response.json();

    if (!Array.isArray(decoded)) {
      return {
        status: "unavailable",
      };
    }

    if (decoded.length === 0) {
      return {
        status: "missing",
      };
    }

    if (
      !isOpportunitySummary(
        decoded[0],
      )
    ) {
      return {
        status: "unavailable",
      };
    }

    return {
      status: "found",
      opportunity:
        decoded[0],
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

async function readTransitions(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<
  OpportunityTransition[] | null
> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/opportunity_transitions",
        env.SUPABASE_URL,
      );
  } catch {
    return null;
  }

  endpoint.searchParams.set(
    "select",
    [
      "id",
      "opportunity_id",
      "environment",
      "from_status",
      "to_status",
      "transitioned_at",
      "reason_code",
    ].join(","),
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  endpoint.searchParams.set(
    "opportunity_id",
    `eq.${opportunityId}`,
  );

  endpoint.searchParams.set(
    "order",
    "transitioned_at.asc,id.asc",
  );

  endpoint.searchParams.set(
    "limit",
    "16",
  );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "GET",
          headers:
            runtimeHeaders(env),
        },
      );

    if (response.status !== 200) {
      return null;
    }

    const decoded: unknown =
      await response.json();

    if (!Array.isArray(decoded)) {
      return null;
    }

    const transitions:
      OpportunityTransition[] = [];

    for (
      const item
      of decoded
    ) {
      if (
        !isOpportunityTransition(
          item,
        )
      ) {
        return null;
      }

      transitions.push(item);
    }

    return transitions;
  } catch {
    return null;
  }
}

async function readSourceEvent(
  eventId: string,
  env: RuntimeEnv,
): Promise<
  OpportunitySourceEvent | null
> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/event_ledger",
        env.SUPABASE_URL,
      );
  } catch {
    return null;
  }

  endpoint.searchParams.set(
    "select",
    [
      "id",
      "event_type",
      "event_version",
      "ingested_at",
      "request_id",
      "correlation_id",
    ].join(","),
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  endpoint.searchParams.set(
    "id",
    `eq.${eventId}`,
  );

  endpoint.searchParams.set(
    "limit",
    "1",
  );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "GET",
          headers:
            runtimeHeaders(env),
        },
      );

    if (response.status !== 200) {
      return null;
    }

    const decoded: unknown =
      await response.json();

    if (
      !Array.isArray(decoded)
      || decoded.length !== 1
      || !isSourceEvent(
        decoded[0],
      )
    ) {
      return null;
    }

    return decoded[0];
  } catch {
    return null;
  }
}

export async function getOpportunityDetail(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<OpportunityDetailResult> {
  const opportunity =
    await readSingleOpportunity(
      opportunityId,
      env,
    );

  if (
    opportunity.status
    !== "found"
  ) {
    return opportunity;
  }

  const [
    transitions,
    sourceEvent,
  ] =
    await Promise.all([
      readTransitions(
        opportunityId,
        env,
      ),
      readSourceEvent(
        opportunity
          .opportunity
          .source_event_id,
        env,
      ),
    ]);

  if (
    transitions === null
    || sourceEvent === null
  ) {
    return {
      status: "unavailable",
    };
  }

  return {
    status: "found",
    detail: {
      opportunity:
        opportunity.opportunity,
      transitions,
      source_event:
        sourceEvent,
    },
  };
}
