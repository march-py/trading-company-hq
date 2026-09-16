import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  hashIdempotencyKey,
} from "./idempotency";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MACHINE_ID_PATTERN =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

interface CanonicalEventRow {
  id: string;
  environment:
    RuntimeEnv["APP_ENV"];
  event_type: string;
  event_version: number;
  payload:
    Record<string, unknown>;
}

interface TradingViewSignalFields {
  signal_type: string;
  strategy_id: string;
  strategy_version: number;
  exchange: string;
  ticker: string;
  interval: string;
  bar_time: string;
  triggered_at: string;
  direction:
    | "long"
    | "short"
    | "neutral"
    | null;
  setup_key: string | null;
}

export interface OpportunityInsert {
  id: string;
  environment:
    RuntimeEnv["APP_ENV"];
  source_event_id: string;
  dedupe_key_sha256: string;
  status: "detected";
  strategy_id: string;
  strategy_version: number;
  instrument_id: string;
  venue_instrument_id: string | null;
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
}

interface ExistingOpportunityRow {
  id: string;
  source_event_id: string;
  dedupe_key_sha256: string;
  strategy_id: string;
  strategy_version: number;
  instrument_id: string;
  venue_instrument_id: string | null;
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
}

export type OpportunityMaterializationResult =
  | {
      status: "created";
      opportunity_id: string;
    }
  | {
      status: "replay";
      opportunity_id: string;
    }
  | {
      status: "skipped";
    }
  | {
      status: "unresolved_instrument";
    }
  | {
      status: "invalid";
    }
  | {
      status: "conflict";
    }
  | {
      status: "unavailable";
    };

type EventReadResult =
  | {
      status: "found";
      event: CanonicalEventRow;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    };

type OpportunityLookupResult =
  | {
      status: "found";
      row: ExistingOpportunityRow;
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

function isMachineId(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && MACHINE_ID_PATTERN.test(value)
  );
}

function isProviderString(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value === value.trim()
    && !Array.from(value).some(
      (character) => {
        const code =
          character.charCodeAt(0);

        return (
          code <= 0x1f
          || code === 0x7f
        );
      },
    )
  );
}

function normalizeInstant(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const parsed =
    Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed)
    .toISOString();
}

function decodeTradingViewSignal(
  payload:
    Record<string, unknown>,
): TradingViewSignalFields | null {
  if (
    !isMachineId(
      payload.signal_type,
      64,
    )
    || !isMachineId(
      payload.strategy_id,
      64,
    )
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      payload.strategy_version,
    )
    || Number(
      payload.strategy_version,
    ) <= 0
  ) {
    return null;
  }

  if (
    !isProviderString(
      payload.exchange,
      64,
    )
    || !isProviderString(
      payload.ticker,
      128,
    )
    || !isProviderString(
      payload.interval,
      32,
    )
  ) {
    return null;
  }

  const barTime =
    normalizeInstant(
      payload.bar_time,
    );

  const triggeredAt =
    normalizeInstant(
      payload.triggered_at,
    );

  if (
    barTime === null
    || triggeredAt === null
  ) {
    return null;
  }

  let direction:
    TradingViewSignalFields["direction"] =
      null;

  if (
    payload.direction !== undefined
  ) {
    if (
      payload.direction !== "long"
      && payload.direction !== "short"
      && payload.direction !== "neutral"
    ) {
      return null;
    }

    direction =
      payload.direction;
  }

  let setupKey: string | null =
    null;

  if (
    payload.setup_key !== undefined
  ) {
    if (
      !isMachineId(
        payload.setup_key,
        128,
      )
    ) {
      return null;
    }

    setupKey =
      payload.setup_key;
  }

  if (
    !isObject(payload.payload)
  ) {
    return null;
  }

  return {
    signal_type:
      payload.signal_type,
    strategy_id:
      payload.strategy_id,
    strategy_version:
      Number(
        payload.strategy_version,
      ),
    exchange:
      payload.exchange,
    ticker:
      payload.ticker,
    interval:
      payload.interval,
    bar_time:
      barTime,
    triggered_at:
      triggeredAt,
    direction,
    setup_key:
      setupKey,
  };
}

function isCanonicalEventRow(
  value: unknown,
): value is CanonicalEventRow {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && (
      value.environment === "dev"
      || value.environment === "prod"
    )
    && typeof value.event_type
      === "string"
    && Number.isInteger(
      value.event_version,
    )
    && isObject(value.payload)
  );
}

async function readCanonicalEvent(
  eventId: string,
  env: RuntimeEnv,
): Promise<EventReadResult> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/event_ledger",
        env.SUPABASE_URL,
      );
  } catch {
    return {
      status: "unavailable",
    };
  }

  endpoint.searchParams.set(
    "select",
    [
      "id",
      "environment",
      "event_type",
      "event_version",
      "payload",
    ].join(","),
  );

  endpoint.searchParams.set(
    "id",
    `eq.${eventId}`,
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
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
      !isCanonicalEventRow(
        decoded[0],
      )
    ) {
      return {
        status: "unavailable",
      };
    }

    return {
      status: "found",
      event:
        decoded[0],
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

interface ResolvedInstrument {
  instrument_id: string;
  venue_instrument_id: string | null;
}

type InstrumentResolutionResult =
  | {
      status: "found";
      identity: ResolvedInstrument;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    };

async function resolveTradingViewInstrument(
  signal: TradingViewSignalFields,
  env: RuntimeEnv,
): Promise<InstrumentResolutionResult> {
  let aliasEndpoint: URL;

  try {
    aliasEndpoint = new URL(
      "/rest/v1/instrument_aliases",
      env.SUPABASE_URL,
    );
  } catch {
    return { status: "unavailable" };
  }

  aliasEndpoint.searchParams.set(
    "select",
    "instrument_id,venue_instrument_id",
  );
  aliasEndpoint.searchParams.set(
    "namespace",
    "eq.tradingview",
  );
  aliasEndpoint.searchParams.set(
    "alias",
    `eq.${signal.exchange}:${signal.ticker}`,
  );
  aliasEndpoint.searchParams.set("limit", "1");

  let aliasRows: unknown;

  try {
    const response = await fetch(
      aliasEndpoint,
      {
        method: "GET",
        headers: runtimeHeaders(env),
      },
    );

    if (response.status !== 200) {
      return { status: "unavailable" };
    }

    aliasRows = await response.json();
  } catch {
    return { status: "unavailable" };
  }

  if (!Array.isArray(aliasRows)) {
    return { status: "unavailable" };
  }

  if (aliasRows.length === 0) {
    return { status: "missing" };
  }

  const aliasRow = aliasRows[0];

  if (!isObject(aliasRow)) {
    return { status: "unavailable" };
  }

  if (
    typeof aliasRow.instrument_id === "string"
    && UUID_PATTERN.test(aliasRow.instrument_id)
    && aliasRow.venue_instrument_id === null
  ) {
    return {
      status: "found",
      identity: {
        instrument_id: aliasRow.instrument_id,
        venue_instrument_id: null,
      },
    };
  }

  if (
    aliasRow.instrument_id !== null
    || typeof aliasRow.venue_instrument_id !== "string"
    || !UUID_PATTERN.test(aliasRow.venue_instrument_id)
  ) {
    return { status: "unavailable" };
  }

  const venueInstrumentId = aliasRow.venue_instrument_id;

  let venueEndpoint: URL;

  try {
    venueEndpoint = new URL(
      "/rest/v1/venue_instruments",
      env.SUPABASE_URL,
    );
  } catch {
    return { status: "unavailable" };
  }

  venueEndpoint.searchParams.set(
    "select",
    "id,instrument_id",
  );
  venueEndpoint.searchParams.set(
    "id",
    `eq.${venueInstrumentId}`,
  );
  venueEndpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(
      venueEndpoint,
      {
        method: "GET",
        headers: runtimeHeaders(env),
      },
    );

    if (response.status !== 200) {
      return { status: "unavailable" };
    }

    const rows: unknown = await response.json();

    if (
      !Array.isArray(rows)
      || rows.length !== 1
      || !isObject(rows[0])
      || rows[0].id !== venueInstrumentId
      || typeof rows[0].instrument_id !== "string"
      || !UUID_PATTERN.test(rows[0].instrument_id)
    ) {
      return { status: "unavailable" };
    }

    return {
      status: "found",
      identity: {
        instrument_id: rows[0].instrument_id,
        venue_instrument_id: venueInstrumentId,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

function tradingViewDeepLink(
  exchange: string,
  ticker: string,
): string {
  const url =
    new URL(
      "https://www.tradingview.com/chart/",
    );

  url.searchParams.set(
    "symbol",
    `${exchange}:${ticker}`,
  );

  return url.toString();
}

async function buildOpportunity(
  event: CanonicalEventRow,
  signal:
    TradingViewSignalFields,
  instrument:
    ResolvedInstrument,
): Promise<OpportunityInsert> {
  const identity =
    JSON.stringify({
      contract_version: 1,
      signal_type:
        signal.signal_type,
      strategy_id:
        signal.strategy_id,
      strategy_version:
        signal.strategy_version,
      exchange:
        signal.exchange,
      ticker:
        signal.ticker,
      interval:
        signal.interval,
      bar_time:
        signal.bar_time,
      triggered_at:
        signal.triggered_at,
      direction:
        signal.direction,
      setup_key:
        signal.setup_key,
    });

  const dedupeKey =
    await hashIdempotencyKey(
      `opportunity:v1:${identity}`,
    );

  return {
    id:
      crypto.randomUUID(),
    environment:
      event.environment,
    source_event_id:
      event.id,
    dedupe_key_sha256:
      dedupeKey,
    status:
      "detected",
    strategy_id:
      signal.strategy_id,
    strategy_version:
      signal.strategy_version,
    instrument_id:
      instrument.instrument_id,
    venue_instrument_id:
      instrument.venue_instrument_id,
    exchange:
      signal.exchange,
    ticker:
      signal.ticker,
    interval:
      signal.interval,
    triggered_at:
      signal.triggered_at,
    direction:
      signal.direction,
    setup_key:
      signal.setup_key,
    tradingview_deep_link:
      tradingViewDeepLink(
        signal.exchange,
        signal.ticker,
      ),
  };
}

function isExistingOpportunityRow(
  value: unknown,
): value is ExistingOpportunityRow {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.source_event_id
      === "string"
    && UUID_PATTERN.test(
      value.source_event_id,
    )
    && typeof value.dedupe_key_sha256
      === "string"
    && /^[0-9a-f]{64}$/.test(
      value.dedupe_key_sha256,
    )
    && typeof value.strategy_id
      === "string"
    && Number.isInteger(
      value.strategy_version,
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
    && typeof value.exchange
      === "string"
    && typeof value.ticker
      === "string"
    && typeof value.interval
      === "string"
    && typeof value.triggered_at
      === "string"
    && Number.isFinite(
      Date.parse(
        value.triggered_at,
      ),
    )
    && (
      value.direction === null
      || value.direction === "long"
      || value.direction === "short"
      || value.direction === "neutral"
    )
    && (
      value.setup_key === null
      || typeof value.setup_key
        === "string"
    )
    && typeof value.tradingview_deep_link
      === "string"
  );
}

async function lookupOpportunity(
  field:
    | "source_event_id"
    | "dedupe_key_sha256",
  value: string,
  env: RuntimeEnv,
): Promise<OpportunityLookupResult> {
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
    [
      "id",
      "source_event_id",
      "dedupe_key_sha256",
      "strategy_id",
      "strategy_version",
      "instrument_id",
      "venue_instrument_id",
      "exchange",
      "ticker",
      "interval",
      "triggered_at",
      "direction",
      "setup_key",
      "tradingview_deep_link",
    ].join(","),
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  endpoint.searchParams.set(
    field,
    `eq.${value}`,
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
      !isExistingOpportunityRow(
        decoded[0],
      )
    ) {
      return {
        status: "unavailable",
      };
    }

    return {
      status: "found",
      row:
        decoded[0],
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

function sameInstant(
  left: string,
  right: string,
): boolean {
  return (
    Date.parse(left)
    === Date.parse(right)
  );
}

function matchesCandidate(
  row:
    ExistingOpportunityRow,
  candidate:
    OpportunityInsert,
  requireSourceEvent: boolean,
): boolean {
  return (
    (
      !requireSourceEvent
      || row.source_event_id
        === candidate.source_event_id
    )
    && row.dedupe_key_sha256
      === candidate.dedupe_key_sha256
    && row.strategy_id
      === candidate.strategy_id
    && row.strategy_version
      === candidate.strategy_version
    && row.instrument_id
      === candidate.instrument_id
    && row.venue_instrument_id
      === candidate.venue_instrument_id
    && row.exchange
      === candidate.exchange
    && row.ticker
      === candidate.ticker
    && row.interval
      === candidate.interval
    && sameInstant(
      row.triggered_at,
      candidate.triggered_at,
    )
    && row.direction
      === candidate.direction
    && row.setup_key
      === candidate.setup_key
    && row.tradingview_deep_link
      === candidate.tradingview_deep_link
  );
}

export async function materializeOpportunityForEvent(
  eventId: string,
  env: RuntimeEnv,
): Promise<OpportunityMaterializationResult> {
  const source =
    await readCanonicalEvent(
      eventId,
      env,
    );

  if (
    source.status !== "found"
  ) {
    return {
      status: "unavailable",
    };
  }

  if (
    source.event.event_type
    !== "tradingview.signal"
  ) {
    return {
      status: "skipped",
    };
  }

  if (
    source.event.event_version !== 1
  ) {
    return {
      status: "invalid",
    };
  }

  const signal =
    decodeTradingViewSignal(
      source.event.payload,
    );

  if (signal === null) {
    return {
      status: "invalid",
    };
  }

  const resolution =
    await resolveTradingViewInstrument(
      signal,
      env,
    );

  if (
    resolution.status
    === "unavailable"
  ) {
    return { status: "unavailable" };
  }

  if (
    resolution.status
    === "missing"
  ) {
    return {
      status: "unresolved_instrument",
    };
  }

  const candidate =
    await buildOpportunity(
      source.event,
      signal,
      resolution.identity,
    );

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

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            ...runtimeHeaders(env),
            "content-type":
              "application/json",
            prefer:
              "return=minimal",
          },
          body:
            JSON.stringify(
              candidate,
            ),
        },
      );

    if (response.status === 201) {
      return {
        status: "created",
        opportunity_id:
          candidate.id,
      };
    }
  } catch {
    void 0;
  }

  const bySource =
    await lookupOpportunity(
      "source_event_id",
      candidate.source_event_id,
      env,
    );

  if (
    bySource.status
    === "unavailable"
  ) {
    return {
      status: "unavailable",
    };
  }

  if (
    bySource.status === "found"
  ) {
    if (
      matchesCandidate(
        bySource.row,
        candidate,
        true,
      )
    ) {
      return {
        status: "replay",
        opportunity_id:
          bySource.row.id,
      };
    }

    return {
      status: "conflict",
    };
  }

  const byDedupe =
    await lookupOpportunity(
      "dedupe_key_sha256",
      candidate.dedupe_key_sha256,
      env,
    );

  if (
    byDedupe.status
    === "unavailable"
  ) {
    return {
      status: "unavailable",
    };
  }

  if (
    byDedupe.status === "found"
  ) {
    if (
      matchesCandidate(
        byDedupe.row,
        candidate,
        false,
      )
    ) {
      return {
        status: "replay",
        opportunity_id:
          byDedupe.row.id,
      };
    }

    return {
      status: "conflict",
    };
  }

  return {
    status: "unavailable",
  };
}
