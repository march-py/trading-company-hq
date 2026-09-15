import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  decodeOpportunityCursor,
  getOpportunityDetail,
  isOpportunityStatus,
  listOpportunities,
  type OpportunityListInput,
} from "./opportunity-query";

import {
  reconcileOpportunities,
  type ReconciliationInput,
  type ReconciliationResult,
} from "./opportunity-reconciliation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MACHINE_ID_PATTERN =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const TICKER_PATTERN =
  /^[A-Za-z0-9._:/-]+$/;

const OPPORTUNITY_PATH =
  "/api/opportunities";

const ALLOWED_LIST_PARAMS =
  new Set([
    "status",
    "strategy_id",
    "ticker",
    "limit",
    "cursor",
  ]);

export interface OpportunityApiDependencies {
  list:
    typeof listOpportunities;
  detail:
    typeof getOpportunityDetail;
  reconcile?: (
    input: ReconciliationInput,
    env: RuntimeEnv,
  ) => Promise<ReconciliationResult>;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers:
    Record<string, string> = {},
): Response {
  return Response.json(
    body,
    {
      status,
      headers: {
        "cache-control":
          "no-store",
        ...headers,
      },
    },
  );
}

function methodNotAllowed(
  allow: "GET" | "POST",
): Response {
  return jsonResponse(
    {
      error:
        "method_not_allowed",
    },
    405,
    {
      allow,
    },
  );
}

const MAX_RECONCILIATION_BODY_BYTES =
  4096;

function isJsonRequest(
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

type JsonBodyReadResult =
  | {
      status: "ok";
      value:
        Record<string, unknown>;
    }
  | {
      status: "invalid";
    }
  | {
      status: "too_large";
    };

async function readBoundedJsonObject(
  request: Request,
): Promise<JsonBodyReadResult> {
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
        > MAX_RECONCILIATION_BODY_BYTES
    ) {
      return {
        status: "too_large",
      };
    }
  }

  if (request.body === null) {
    return {
      status: "invalid",
    };
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
      > MAX_RECONCILIATION_BODY_BYTES
    ) {
      await reader.cancel();

      return {
        status: "too_large",
      };
    }

    chunks.push(value);
  }

  if (total === 0) {
    return {
      status: "invalid",
    };
  }

  const bytes =
    new Uint8Array(total);

  let offset = 0;

  for (
    const chunk
    of chunks
  ) {
    bytes.set(
      chunk,
      offset,
    );

    offset +=
      chunk.byteLength;
  }

  let decoded: unknown;

  try {
    decoded =
      JSON.parse(
        new TextDecoder(
          "utf-8",
          {
            fatal: true,
          },
        ).decode(bytes),
      );
  } catch {
    return {
      status: "invalid",
    };
  }

  if (
    typeof decoded
      !== "object"
    || decoded === null
    || Array.isArray(decoded)
  ) {
    return {
      status: "invalid",
    };
  }

  return {
    status: "ok",
    value:
      decoded as Record<
        string,
        unknown
      >,
  };
}

function parseReconciliationInput(
  value:
    Record<string, unknown>,
): ReconciliationInput | null {
  const allowed =
    new Set([
      "mode",
      "lookback_hours",
      "limit",
    ]);

  for (
    const key
    of Object.keys(value)
  ) {
    if (!allowed.has(key)) {
      return null;
    }
  }

  if (
    value.mode !== "dry_run"
    && value.mode !== "repair"
  ) {
    return null;
  }

  const input:
    ReconciliationInput = {
      mode:
        value.mode,
      lookback_hours: 24,
      limit: 100,
    };

  if (
    value.lookback_hours
    !== undefined
  ) {
    if (
      !Number.isInteger(
        value.lookback_hours,
      )
      || Number(
        value.lookback_hours,
      ) < 1
      || Number(
        value.lookback_hours,
      ) > 168
    ) {
      return null;
    }

    input.lookback_hours =
      Number(
        value.lookback_hours,
      );
  }

  if (
    value.limit !== undefined
  ) {
    if (
      !Number.isInteger(
        value.limit,
      )
      || Number(
        value.limit,
      ) < 1
      || Number(
        value.limit,
      ) > 500
    ) {
      return null;
    }

    input.limit =
      Number(value.limit);
  }

  return input;
}

function hasDuplicateParams(
  url: URL,
): boolean {
  for (
    const key
    of ALLOWED_LIST_PARAMS
  ) {
    if (
      url.searchParams
        .getAll(key)
        .length > 1
    ) {
      return true;
    }
  }

  return false;
}

function parseListInput(
  url: URL,
): OpportunityListInput | null {
  for (
    const key
    of url.searchParams.keys()
  ) {
    if (
      !ALLOWED_LIST_PARAMS
        .has(key)
    ) {
      return null;
    }
  }

  if (hasDuplicateParams(url)) {
    return null;
  }

  const input:
    OpportunityListInput = {
      limit: 50,
    };

  const rawStatus =
    url.searchParams
      .get("status");

  if (rawStatus !== null) {
    if (
      !isOpportunityStatus(
        rawStatus,
      )
    ) {
      return null;
    }

    input.status =
      rawStatus;
  }

  const rawStrategy =
    url.searchParams
      .get("strategy_id");

  if (rawStrategy !== null) {
    if (
      rawStrategy.length === 0
      || rawStrategy.length > 64
      || !MACHINE_ID_PATTERN.test(
        rawStrategy,
      )
    ) {
      return null;
    }

    input.strategy_id =
      rawStrategy;
  }

  const rawTicker =
    url.searchParams
      .get("ticker");

  if (rawTicker !== null) {
    if (
      rawTicker.length === 0
      || rawTicker.length > 128
      || !TICKER_PATTERN.test(
        rawTicker,
      )
    ) {
      return null;
    }

    input.ticker =
      rawTicker;
  }

  const rawLimit =
    url.searchParams
      .get("limit");

  if (rawLimit !== null) {
    if (
      !/^[1-9][0-9]{0,2}$/
        .test(rawLimit)
    ) {
      return null;
    }

    const parsed =
      Number(rawLimit);

    if (
      parsed < 1
      || parsed > 100
    ) {
      return null;
    }

    input.limit =
      parsed;
  }

  const rawCursor =
    url.searchParams
      .get("cursor");

  if (rawCursor !== null) {
    const cursor =
      decodeOpportunityCursor(
        rawCursor,
      );

    if (cursor === null) {
      return null;
    }

    input.cursor =
      cursor;
  }

  return input;
}

export function createOpportunityApiHandler(
  dependencies:
    OpportunityApiDependencies = {
      list:
        listOpportunities,
      detail:
        getOpportunityDetail,
    },
) {
  return async function handleOpportunityApi(
    request: Request,
    env: RuntimeEnv,
  ): Promise<Response> {
    const url =
      new URL(request.url);

    if (
      url.pathname
      === `${OPPORTUNITY_PATH}/reconcile`
    ) {
      if (
        request.method !== "POST"
      ) {
        return methodNotAllowed(
          "POST",
        );
      }

      if (!isJsonRequest(request)) {
        return jsonResponse(
          {
            error:
              "unsupported_media_type",
          },
          415,
        );
      }

      const body =
        await readBoundedJsonObject(
          request,
        );

      if (
        body.status
        === "too_large"
      ) {
        return jsonResponse(
          {
            error:
              "payload_too_large",
          },
          413,
        );
      }

      if (
        body.status
        === "invalid"
      ) {
        return jsonResponse(
          {
            error:
              "invalid_reconciliation_request",
          },
          400,
        );
      }

      const input =
        parseReconciliationInput(
          body.value,
        );

      if (input === null) {
        return jsonResponse(
          {
            error:
              "invalid_reconciliation_request",
          },
          400,
        );
      }

      const reconcile =
        dependencies.reconcile
        ?? reconcileOpportunities;

      const result =
        await reconcile(
          input,
          env,
        );

      if (
        result.status
        === "unavailable"
      ) {
        return jsonResponse(
          {
            error:
              "reconciliation_store_unavailable",
          },
          503,
        );
      }

      if (
        result.status
        === "repair_failed"
      ) {
        return jsonResponse(
          {
            error:
              "reconciliation_dispatch_failed",
            ...result.report,
            failed_event_ids:
              result.failed_event_ids,
          },
          503,
        );
      }

      return jsonResponse(
        result.report,
      );
    }

    if (
      url.pathname
      === OPPORTUNITY_PATH
    ) {
      if (
        request.method !== "GET"
      ) {
        return methodNotAllowed("GET");
      }

      const input =
        parseListInput(url);

      if (input === null) {
        return jsonResponse(
          {
            error:
              "invalid_opportunity_query",
          },
          400,
        );
      }

      const result =
        await dependencies
          .list(
            input,
            env,
          );

      if (
        result.status
        === "unavailable"
      ) {
        return jsonResponse(
          {
            error:
              "opportunity_store_unavailable",
          },
          503,
        );
      }

      return jsonResponse({
        items:
          result.items,
        next_cursor:
          result.next_cursor,
      });
    }

    if (
      !url.pathname.startsWith(
        `${OPPORTUNITY_PATH}/`,
      )
    ) {
      return jsonResponse(
        {
          error:
            "not_found",
        },
        404,
      );
    }

    const opportunityId =
      url.pathname.slice(
        OPPORTUNITY_PATH.length
        + 1,
      );

    if (
      opportunityId.length === 0
      || opportunityId
        .includes("/")
    ) {
      return jsonResponse(
        {
          error:
            "not_found",
        },
        404,
      );
    }

    if (
      request.method !== "GET"
    ) {
      return methodNotAllowed("GET");
    }

    if (
      !UUID_PATTERN.test(
        opportunityId,
      )
    ) {
      return jsonResponse(
        {
          error:
            "invalid_opportunity_id",
        },
        400,
      );
    }

    const result =
      await dependencies
        .detail(
          opportunityId,
          env,
        );

    if (
      result.status
      === "missing"
    ) {
      return jsonResponse(
        {
          error:
            "opportunity_not_found",
        },
        404,
      );
    }

    if (
      result.status
      === "unavailable"
    ) {
      return jsonResponse(
        {
          error:
            "opportunity_store_unavailable",
        },
        503,
      );
    }

    return jsonResponse(
      result.detail,
    );
  };
}
