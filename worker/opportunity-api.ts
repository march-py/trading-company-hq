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

function methodNotAllowed(): Response {
  return jsonResponse(
    {
      error:
        "method_not_allowed",
    },
    405,
    {
      allow: "GET",
    },
  );
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
      === OPPORTUNITY_PATH
    ) {
      if (
        request.method !== "GET"
      ) {
        return methodNotAllowed();
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
      return methodNotAllowed();
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
