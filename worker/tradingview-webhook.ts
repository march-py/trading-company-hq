import {
  MAX_EVENT_BODY_BYTES,
} from "./event-envelope";

import {
  persistIdempotentEvent,
  type EventStoreResult,
  type IdempotentEventInsert,
} from "./event-store";

import {
  hashIdempotencyKey,
} from "./idempotency";

import {
  dispatchEvent,
  type DispatchEvent,
} from "./queue-dispatch";

import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  isAuthorizedTradingViewRoute,
} from "./tradingview-auth";

import {
  validateTradingViewPayload,
} from "./tradingview-payload";

const decoder =
  new TextDecoder(
    "utf-8",
    {
      fatal: true,
    },
  );

export type PersistTradingViewEvent = (
  event: IdempotentEventInsert,
  env: RuntimeEnv,
) => Promise<EventStoreResult>;

function errorResponse(
  error: string,
  status: number,
): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: "method_not_allowed",
    },
    {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
      },
    },
  );
}

function isJson(
  request: Request,
): boolean {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase()
    === "application/json"
  );
}

async function readBoundedBody(
  request: Request,
): Promise<Uint8Array | null> {
  const declaredLength =
    request.headers.get(
      "content-length",
    );

  if (
    declaredLength !== null
  ) {
    const parsed =
      Number(declaredLength);

    if (
      !Number.isFinite(parsed)
      || parsed < 0
      || parsed
        > MAX_EVENT_BODY_BYTES
    ) {
      return null;
    }
  }

  if (
    request.body === null
  ) {
    return new Uint8Array();
  }

  const reader =
    request.body.getReader();

  const chunks:
    Uint8Array[] = [];

  let total = 0;

  while (true) {
    const {
      done,
      value,
    } = await reader.read();

    if (done) {
      break;
    }

    total +=
      value.byteLength;

    if (
      total
      > MAX_EVENT_BODY_BYTES
    ) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const result =
    new Uint8Array(total);

  let offset = 0;

  for (
    const chunk
    of chunks
  ) {
    result.set(
      chunk,
      offset,
    );

    offset +=
      chunk.byteLength;
  }

  return result;
}

async function sha256Hex(
  bytes: Uint8Array,
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(
        bytes,
      ).buffer,
    );

  return [
    ...new Uint8Array(
      digest,
    ),
  ]
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0"),
    )
    .join("");
}

export function createTradingViewWebhookHandler(
  persist:
    PersistTradingViewEvent =
      persistIdempotentEvent,
  dispatch:
    DispatchEvent =
      dispatchEvent,
) {
  return async function handleTradingViewWebhook(
    request: Request,
    env: RuntimeEnv,
  ): Promise<Response> {
    const url =
      new URL(request.url);

    if (
      !isAuthorizedTradingViewRoute(
        url.pathname,
        env,
      )
    ) {
      return errorResponse(
        "not_found",
        404,
      );
    }

    if (
      request.method !== "POST"
    ) {
      return methodNotAllowed();
    }

    if (!isJson(request)) {
      return errorResponse(
        "unsupported_media_type",
        415,
      );
    }

    const rawBody =
      await readBoundedBody(
        request,
      );

    if (
      rawBody === null
    ) {
      return errorResponse(
        "payload_too_large",
        413,
      );
    }

    if (
      rawBody.byteLength === 0
    ) {
      return errorResponse(
        "invalid_tradingview_payload",
        400,
      );
    }

    let decoded: unknown;

    try {
      decoded =
        JSON.parse(
          decoder.decode(
            rawBody,
          ),
        );
    } catch {
      return errorResponse(
        "invalid_tradingview_payload",
        400,
      );
    }

    const validated =
      validateTradingViewPayload(
        decoded,
      );

    if (!validated.ok) {
      return errorResponse(
        validated.reason
          === "unsupported_contract"
          ? "unsupported_tradingview_contract"
          : "invalid_tradingview_payload",
        400,
      );
    }

    const rawBodySha256 =
      await sha256Hex(
        rawBody,
      );

    const syntheticKey =
      `tv:${rawBodySha256}`;

    const idempotencyKeySha256 =
      await hashIdempotencyKey(
        syntheticKey,
      );

    const requestId =
      crypto.randomUUID();

    const eventId =
      crypto.randomUUID();

    const stored =
      await persist(
        {
          ...validated.envelope,
          id: eventId,
          environment:
            env.APP_ENV,
          request_id:
            requestId,
          correlation_id:
            requestId,
          request_body_sha256:
            rawBodySha256,
          idempotency_key_sha256:
            idempotencyKeySha256,
        },
        env,
      );

    if (
      stored.status
      === "unavailable"
    ) {
      return errorResponse(
        "persistence_unavailable",
        503,
      );
    }

    if (
      stored.status
      === "conflict"
    ) {
      return errorResponse(
        "tradingview_idempotency_conflict",
        409,
      );
    }

    const dispatched =
      await dispatch(
        stored.event_id,
        env.APP_ENV,
        env,
      );

    if (!dispatched) {
      return errorResponse(
        "dispatch_unavailable",
        503,
      );
    }

    return Response.json(
      {
        accepted: true,
        event_id:
          stored.event_id,
        request_id:
          stored.request_id,
        contract_version: 1,
      },
      {
        status: 202,
        headers: {
          "cache-control":
            "no-store",
        },
      },
    );
  };
}
