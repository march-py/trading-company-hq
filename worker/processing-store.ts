import type { RuntimeEnv } from "./event-persistence";

export type ProcessingStatus =
  | "processing"
  | "succeeded";

interface ProcessingReceiptRow {
  event_id: string;
  environment: RuntimeEnv["APP_ENV"];
  status: ProcessingStatus;
  attempt_count: number;
  first_started_at: string | null;
  processed_at: string | null;
}

export type BeginProcessingResult =
  | {
      status: "started";
      attempt_count: number;
    }
  | {
      status: "already_succeeded";
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

function isReceiptRow(
  value: unknown,
): value is ProcessingReceiptRow {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const row =
    value as Record<string, unknown>;

  return (
    typeof row.event_id === "string"
    && (
      row.environment === "dev"
      || row.environment === "prod"
    )
    && (
      row.status === "processing"
      || row.status === "succeeded"
    )
    && Number.isInteger(
      row.attempt_count,
    )
    && Number(row.attempt_count) >= 0
    && (
      row.first_started_at === null
      || typeof row.first_started_at
        === "string"
    )
    && (
      row.processed_at === null
      || typeof row.processed_at
        === "string"
    )
  );
}

async function fetchReceipt(
  eventId: string,
  env: RuntimeEnv,
): Promise<
  | {
      status: "found";
      row: ProcessingReceiptRow;
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
    endpoint = new URL(
      "/rest/v1/event_processing_receipts",
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
      "event_id",
      "environment",
      "status",
      "attempt_count",
      "first_started_at",
      "processed_at",
    ].join(","),
  );

  endpoint.searchParams.set(
    "event_id",
    `eq.${eventId}`,
  );

  endpoint.searchParams.set(
    "limit",
    "1",
  );

  try {
    const response = await fetch(
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

    if (!isReceiptRow(decoded[0])) {
      return {
        status: "unavailable",
      };
    }

    return {
      status: "found",
      row: decoded[0],
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

function successfulWrite(
  response: Response,
): boolean {
  return (
    response.status === 200
    || response.status === 201
    || response.status === 204
  );
}

export async function beginProcessingReceipt(
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  env: RuntimeEnv,
): Promise<BeginProcessingResult> {
  const existing =
    await fetchReceipt(
      eventId,
      env,
    );

  if (
    existing.status
    === "unavailable"
  ) {
    return {
      status: "unavailable",
    };
  }

  if (
    existing.status === "found"
    && existing.row.status
      === "succeeded"
  ) {
    return {
      status:
        "already_succeeded",
    };
  }

  if (
    existing.status === "found"
    && existing.row.environment
      !== environment
  ) {
    return {
      status: "unavailable",
    };
  }

  const now =
    new Date().toISOString();

  const attemptCount =
    existing.status === "found"
      ? existing.row.attempt_count + 1
      : 1;

  const firstStartedAt =
    existing.status === "found"
      ? existing.row.first_started_at
        ?? now
      : now;

  const processedAt =
    existing.status === "found"
      ? existing.row.processed_at
      : null;

  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/event_processing_receipts",
      env.SUPABASE_URL,
    );
  } catch {
    return {
      status: "unavailable",
    };
  }

  endpoint.searchParams.set(
    "on_conflict",
    "event_id",
  );

  try {
    const response = await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          ...runtimeHeaders(env),
          "content-type":
            "application/json",
          prefer:
            "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          event_id: eventId,
          environment,
          status: "processing",
          attempt_count:
            attemptCount,
          last_queue_message_id:
            queueMessageId,
          first_started_at:
            firstStartedAt,
          processed_at:
            processedAt,
          last_attempt_at: now,
          last_error_code: null,
        }),
      },
    );

    if (!successfulWrite(response)) {
      return {
        status: "unavailable",
      };
    }

    return {
      status: "started",
      attempt_count:
        attemptCount,
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

export async function markProcessingSucceeded(
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  env: RuntimeEnv,
): Promise<boolean> {
  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/event_processing_receipts",
      env.SUPABASE_URL,
    );
  } catch {
    return false;
  }

  endpoint.searchParams.set(
    "event_id",
    `eq.${eventId}`,
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${environment}`,
  );

  const now =
    new Date().toISOString();

  try {
    const response = await fetch(
      endpoint,
      {
        method: "PATCH",
        headers: {
          ...runtimeHeaders(env),
          "content-type":
            "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "succeeded",
          processed_at: now,
          last_attempt_at: now,
          last_queue_message_id:
            queueMessageId,
          last_error_code: null,
        }),
      },
    );

    return successfulWrite(response);
  } catch {
    return false;
  }
}

export async function recordProcessingFailure(
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  failureCode: string,
  env: RuntimeEnv,
): Promise<boolean> {
  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/event_processing_receipts",
      env.SUPABASE_URL,
    );
  } catch {
    return false;
  }

  endpoint.searchParams.set(
    "event_id",
    `eq.${eventId}`,
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${environment}`,
  );

  try {
    const response = await fetch(
      endpoint,
      {
        method: "PATCH",
        headers: {
          ...runtimeHeaders(env),
          "content-type":
            "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          last_queue_message_id:
            queueMessageId,
          last_attempt_at:
            new Date().toISOString(),
          last_error_code:
            failureCode,
        }),
      },
    );

    return successfulWrite(response);
  } catch {
    return false;
  }
}
