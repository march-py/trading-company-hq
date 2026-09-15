import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  dispatchEvent,
  type DispatchEvent,
} from "./queue-dispatch";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReconciliationInput {
  mode:
    | "dry_run"
    | "repair";
  lookback_hours: number;
  limit: number;
}

export interface ReconciliationReport {
  mode:
    ReconciliationInput["mode"];
  lookback_hours: number;
  limit: number;
  scanned_count: number;
  missing_count: number;
  missing_event_ids: string[];
  truncated: boolean;
  redispatched_count: number;
}

export type ReconciliationResult =
  | {
      status: "ok";
      report:
        ReconciliationReport;
    }
  | {
      status: "repair_failed";
      report:
        ReconciliationReport;
      failed_event_ids:
        string[];
    }
  | {
      status: "unavailable";
    };

interface EventRow {
  id: string;
  ingested_at: string;
}

interface EventScan {
  rows: EventRow[];
  truncated: boolean;
}

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

function isEventRow(
  value: unknown,
): value is EventRow {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.ingested_at
      === "string"
    && Number.isFinite(
      Date.parse(
        value.ingested_at,
      ),
    )
  );
}

async function scanTradingViewEvents(
  input: ReconciliationInput,
  env: RuntimeEnv,
): Promise<EventScan | null> {
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

  const since =
    new Date(
      Date.now()
      - input.lookback_hours
        * 60
        * 60
        * 1000,
    ).toISOString();

  endpoint.searchParams.set(
    "select",
    "id,ingested_at",
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  endpoint.searchParams.set(
    "event_type",
    "eq.tradingview.signal",
  );

  endpoint.searchParams.set(
    "ingested_at",
    `gte.${since}`,
  );

  endpoint.searchParams.set(
    "order",
    "ingested_at.desc,id.desc",
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
      return null;
    }

    const decoded: unknown =
      await response.json();

    if (!Array.isArray(decoded)) {
      return null;
    }

    const rows: EventRow[] =
      [];

    for (
      const item
      of decoded
    ) {
      if (!isEventRow(item)) {
        return null;
      }

      rows.push(item);
    }

    return {
      rows:
        rows.slice(
          0,
          input.limit,
        ),
      truncated:
        rows.length
        > input.limit,
    };
  } catch {
    return null;
  }
}

async function readExistingSourceIds(
  eventIds: string[],
  env: RuntimeEnv,
): Promise<Set<string> | null> {
  const found =
    new Set<string>();

  for (
    let offset = 0;
    offset < eventIds.length;
    offset += 100
  ) {
    const chunk =
      eventIds.slice(
        offset,
        offset + 100,
      );

    if (chunk.length === 0) {
      continue;
    }

    let endpoint: URL;

    try {
      endpoint =
        new URL(
          "/rest/v1/opportunities",
          env.SUPABASE_URL,
        );
    } catch {
      return null;
    }

    endpoint.searchParams.set(
      "select",
      "source_event_id",
    );

    endpoint.searchParams.set(
      "environment",
      `eq.${env.APP_ENV}`,
    );

    endpoint.searchParams.set(
      "source_event_id",
      `in.(${chunk.join(",")})`,
    );

    endpoint.searchParams.set(
      "limit",
      String(chunk.length),
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

      if (
        response.status !== 200
      ) {
        return null;
      }

      const decoded: unknown =
        await response.json();

      if (!Array.isArray(decoded)) {
        return null;
      }

      for (
        const item
        of decoded
      ) {
        if (
          !isObject(item)
          || typeof item
            .source_event_id
            !== "string"
          || !UUID_PATTERN.test(
            item.source_event_id,
          )
        ) {
          return null;
        }

        found.add(
          item.source_event_id,
        );
      }
    } catch {
      return null;
    }
  }

  return found;
}

export async function reconcileOpportunities(
  input: ReconciliationInput,
  env: RuntimeEnv,
  dispatch:
    DispatchEvent = dispatchEvent,
): Promise<ReconciliationResult> {
  const scan =
    await scanTradingViewEvents(
      input,
      env,
    );

  if (scan === null) {
    return {
      status: "unavailable",
    };
  }

  const eventIds =
    scan.rows.map(
      (row) => row.id,
    );

  const existing =
    await readExistingSourceIds(
      eventIds,
      env,
    );

  if (existing === null) {
    return {
      status: "unavailable",
    };
  }

  const missingEventIds =
    eventIds.filter(
      (eventId) =>
        !existing.has(eventId),
    );

  const report:
    ReconciliationReport = {
      mode:
        input.mode,
      lookback_hours:
        input.lookback_hours,
      limit:
        input.limit,
      scanned_count:
        eventIds.length,
      missing_count:
        missingEventIds.length,
      missing_event_ids:
        missingEventIds,
      truncated:
        scan.truncated,
      redispatched_count: 0,
    };

  if (
    input.mode === "dry_run"
  ) {
    return {
      status: "ok",
      report,
    };
  }

  const failedEventIds:
    string[] = [];

  for (
    const eventId
    of missingEventIds
  ) {
    const dispatched =
      await dispatch(
        eventId,
        env.APP_ENV,
        env,
      );

    if (dispatched) {
      report.redispatched_count += 1;
    } else {
      failedEventIds.push(
        eventId,
      );
    }
  }

  if (
    failedEventIds.length > 0
  ) {
    return {
      status:
        "repair_failed",
      report,
      failed_event_ids:
        failedEventIds,
    };
  }

  return {
    status: "ok",
    report,
  };
}
