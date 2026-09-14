import type {
  EventLedgerInsert,
  RuntimeEnv,
} from "./event-persistence";

export interface IdempotentEventInsert extends EventLedgerInsert {
  idempotency_key_sha256: string;
}

export type EventStoreResult =
  | {
      status: "created";
      event_id: string;
      request_id: string;
    }
  | {
      status: "replay";
      event_id: string;
      request_id: string;
    }
  | {
      status: "conflict";
    }
  | {
      status: "unavailable";
    };

interface ExistingEventRow {
  id: string;
  request_id: string;
  request_body_sha256: string;
}

type LookupResult =
  | {
      status: "found";
      row: ExistingEventRow;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    };

function runtimeHeaders(env: RuntimeEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isExistingEventRow(value: unknown): value is ExistingEventRow {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "string"
    && typeof row.request_id === "string"
    && typeof row.request_body_sha256 === "string"
    && /^[0-9a-f]{64}$/.test(row.request_body_sha256)
  );
}

async function lookupExistingEvent(
  event: IdempotentEventInsert,
  env: RuntimeEnv,
): Promise<LookupResult> {
  let endpoint: URL;

  try {
    endpoint = new URL("/rest/v1/event_ledger", env.SUPABASE_URL);
  } catch {
    return { status: "unavailable" };
  }

  endpoint.searchParams.set(
    "select",
    "id,request_id,request_body_sha256",
  );
  endpoint.searchParams.set(
    "environment",
    `eq.${event.environment}`,
  );
  endpoint.searchParams.set(
    "idempotency_key_sha256",
    `eq.${event.idempotency_key_sha256}`,
  );
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: runtimeHeaders(env),
    });

    if (response.status !== 200) {
      return { status: "unavailable" };
    }

    const decoded: unknown = await response.json();

    if (!Array.isArray(decoded)) {
      return { status: "unavailable" };
    }

    if (decoded.length === 0) {
      return { status: "missing" };
    }

    if (!isExistingEventRow(decoded[0])) {
      return { status: "unavailable" };
    }

    return {
      status: "found",
      row: decoded[0],
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function persistIdempotentEvent(
  event: IdempotentEventInsert,
  env: RuntimeEnv,
): Promise<EventStoreResult> {
  let endpoint: URL;

  try {
    endpoint = new URL("/rest/v1/event_ledger", env.SUPABASE_URL);
  } catch {
    return { status: "unavailable" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...runtimeHeaders(env),
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(event),
    });

    if (response.status === 201) {
      return {
        status: "created",
        event_id: event.id,
        request_id: event.request_id,
      };
    }
  } catch {
    void 0;
  }

  const existing = await lookupExistingEvent(event, env);

  if (existing.status !== "found") {
    return { status: "unavailable" };
  }

  if (
    existing.row.request_body_sha256
    !== event.request_body_sha256
  ) {
    return { status: "conflict" };
  }

  return {
    status: "replay",
    event_id: existing.row.id,
    request_id: existing.row.request_id,
  };
}
