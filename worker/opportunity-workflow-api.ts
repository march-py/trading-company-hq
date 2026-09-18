import type {
  RuntimeEnv,
} from "./event-persistence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPPORTUNITY_ACTION_PATTERN =
  /^\/api\/opportunities\/([0-9a-f-]+)\/(qualify|alert|seen|create-trade-plan)$/i;

const NOTIFICATION_READ_PATTERN =
  /^\/api\/notifications\/([0-9a-f-]+)\/read$/i;

const NOTIFICATIONS_PATH =
  "/api/notifications";

type Priority =
  | "low"
  | "normal"
  | "high"
  | "critical";

type RpcResult = {
  result: string;
  opportunity_id?: string;
  notification_id?: string;
  trade_plan_request_id?: string;
  request_status?: string;
  status?: string;
};

function runtimeHeaders(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey:
      env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type":
      "application/json",
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(
    body,
    {
      status,
      headers: {
        "cache-control":
          "no-store",
      },
    },
  );
}

function parseOpportunityAction(
  pathname: string,
): {
  opportunityId: string;
  action:
    | "qualify"
    | "alert"
    | "seen"
    | "create-trade-plan";
} | null {
  const match =
    pathname.match(
      OPPORTUNITY_ACTION_PATTERN,
    );

  if (
    match === null
    || !UUID_PATTERN.test(
      match[1] ?? "",
    )
  ) {
    return null;
  }

  const action =
    match[2]?.toLowerCase();

  if (
    action !== "qualify"
    && action !== "alert"
    && action !== "seen"
    && action !== "create-trade-plan"
  ) {
    return null;
  }

  return {
    opportunityId:
      match[1] ?? "",
    action,
  };
}

function parseNotificationRead(
  pathname: string,
): string | null {
  const match =
    pathname.match(
      NOTIFICATION_READ_PATTERN,
    );

  if (
    match === null
    || !UUID_PATTERN.test(
      match[1] ?? "",
    )
  ) {
    return null;
  }

  return match[1] ?? null;
}

export function isS05WorkflowApiRoute(
  pathname: string,
): boolean {
  return (
    pathname
      === NOTIFICATIONS_PATH
    || parseOpportunityAction(
      pathname,
    ) !== null
    || parseNotificationRead(
      pathname,
    ) !== null
  );
}

async function callRpc(
  functionName: string,
  body:
    Record<string, unknown>,
  env: RuntimeEnv,
): Promise<
  | {
      status: "ok";
      value: RpcResult;
    }
  | {
      status: "unavailable";
    }
> {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        `/rest/v1/rpc/${functionName}`,
        env.SUPABASE_URL,
      );
  } catch {
    return {
      status:
        "unavailable",
    };
  }

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "POST",
          headers:
            runtimeHeaders(env),
          body:
            JSON.stringify(body),
        },
      );

    if (
      response.status !== 200
    ) {
      return {
        status:
          "unavailable",
      };
    }

    const decoded: unknown =
      await response.json();

    if (
      typeof decoded
        !== "object"
      || decoded === null
      || Array.isArray(decoded)
      || typeof (
        decoded as {
          result?: unknown;
        }
      ).result
        !== "string"
    ) {
      return {
        status:
          "unavailable",
      };
    }

    return {
      status: "ok",
      value:
        decoded as RpcResult,
    };
  } catch {
    return {
      status:
        "unavailable",
    };
  }
}

function rpcResponse(
  result: RpcResult,
): Response {
  if (
    result.result
    === "not_found"
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
    result.result
      === "invalid_priority"
  ) {
    return jsonResponse(
      {
        error:
          "invalid_priority",
      },
      400,
    );
  }

  if (
    result.result
      === "must_qualify"
    || result.result
      === "must_be_seen"
    || result.result
      === "invalid_state"
    || result.result
      === "notification_missing"
  ) {
    return jsonResponse(
      {
        error:
          result.result,
        ...result,
      },
      409,
    );
  }

  return jsonResponse(
    result,
  );
}

async function readAlertPriority(
  request: Request,
): Promise<
  Priority | "invalid"
> {
  if (
    request.body === null
  ) {
    return "normal";
  }

  const contentType =
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType
      !== "application/json"
  ) {
    return "invalid";
  }

  let decoded: unknown;

  try {
    decoded =
      await request.json();
  } catch {
    return "invalid";
  }

  if (
    typeof decoded
      !== "object"
    || decoded === null
    || Array.isArray(decoded)
  ) {
    return "invalid";
  }

  const keys =
    Object.keys(decoded);

  if (
    keys.length === 0
  ) {
    return "normal";
  }

  if (
    keys.length !== 1
    || keys[0]
      !== "priority"
  ) {
    return "invalid";
  }

  const priority =
    (
      decoded as {
        priority?: unknown;
      }
    ).priority;

  if (
    priority === "low"
    || priority === "normal"
    || priority === "high"
    || priority === "critical"
  ) {
    return priority;
  }

  return "invalid";
}

async function listNotifications(
  request: Request,
  env: RuntimeEnv,
): Promise<Response> {
  const url =
    new URL(request.url);

  const allowed =
    new Set([
      "status",
      "limit",
    ]);

  for (
    const key
    of url.searchParams.keys()
  ) {
    if (!allowed.has(key)) {
      return jsonResponse(
        {
          error:
            "invalid_notification_query",
        },
        400,
      );
    }
  }

  const rawStatus =
    url.searchParams
      .get("status");

  if (
    rawStatus !== null
    && rawStatus !== "unread"
    && rawStatus !== "read"
  ) {
    return jsonResponse(
      {
        error:
          "invalid_notification_query",
      },
      400,
    );
  }

  const rawLimit =
    url.searchParams
      .get("limit")
      ?? "50";

  if (
    !/^[1-9][0-9]{0,2}$/
      .test(rawLimit)
  ) {
    return jsonResponse(
      {
        error:
          "invalid_notification_query",
      },
      400,
    );
  }

  const limit =
    Number(rawLimit);

  if (
    limit < 1
    || limit > 100
  ) {
    return jsonResponse(
      {
        error:
          "invalid_notification_query",
      },
      400,
    );
  }

  let endpoint: URL;

  try {
    endpoint =
      new URL(
        "/rest/v1/notifications",
        env.SUPABASE_URL,
      );
  } catch {
    return jsonResponse(
      {
        error:
          "notification_store_unavailable",
      },
      503,
    );
  }

  endpoint.searchParams.set(
    "select",
    [
      "id",
      "environment",
      "opportunity_id",
      "notification_type",
      "priority",
      "title",
      "body",
      "status",
      "read_at",
      "created_at",
      "updated_at",
    ].join(","),
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  if (rawStatus !== null) {
    endpoint.searchParams.set(
      "status",
      `eq.${rawStatus}`,
    );
  }

  endpoint.searchParams.set(
    "order",
    "created_at.desc",
  );
  endpoint.searchParams.set(
    "limit",
    String(limit),
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
      return jsonResponse(
        {
          error:
            "notification_store_unavailable",
        },
        503,
      );
    }

    const decoded: unknown =
      await response.json();

    if (
      !Array.isArray(decoded)
    ) {
      return jsonResponse(
        {
          error:
            "notification_store_unavailable",
        },
        503,
      );
    }

    return jsonResponse(
      {
        items: decoded,
      },
    );
  } catch {
    return jsonResponse(
      {
        error:
          "notification_store_unavailable",
      },
      503,
    );
  }
}

export async function handleS05WorkflowApi(
  request: Request,
  env: RuntimeEnv,
): Promise<Response> {
  const url =
    new URL(request.url);

  if (
    url.pathname
      === NOTIFICATIONS_PATH
  ) {
    if (
      request.method
        !== "GET"
    ) {
      return jsonResponse(
        {
          error:
            "method_not_allowed",
        },
        405,
      );
    }

    return listNotifications(
      request,
      env,
    );
  }

  const notificationId =
    parseNotificationRead(
      url.pathname,
    );

  if (
    notificationId !== null
  ) {
    if (
      request.method
        !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "method_not_allowed",
        },
        405,
      );
    }

    const result =
      await callRpc(
        "tc_mark_notification_read",
        {
          p_notification_id:
            notificationId,
          p_environment:
            env.APP_ENV,
        },
        env,
      );

    if (
      result.status
        === "unavailable"
    ) {
      return jsonResponse(
        {
          error:
            "workflow_store_unavailable",
        },
        503,
      );
    }

    return rpcResponse(
      result.value,
    );
  }

  const action =
    parseOpportunityAction(
      url.pathname,
    );

  if (action === null) {
    return jsonResponse(
      {
        error:
          "not_found",
      },
      404,
    );
  }

  if (
    request.method
      !== "POST"
  ) {
    return jsonResponse(
      {
        error:
          "method_not_allowed",
      },
      405,
    );
  }

  let functionName: string;
  let body:
    Record<string, unknown> = {
      p_opportunity_id:
        action.opportunityId,
      p_environment:
        env.APP_ENV,
    };

  if (
    action.action
      === "qualify"
  ) {
    functionName =
      "tc_qualify_opportunity";
  } else if (
    action.action
      === "alert"
  ) {
    const priority =
      await readAlertPriority(
        request,
      );

    if (
      priority === "invalid"
    ) {
      return jsonResponse(
        {
          error:
            "invalid_alert_request",
        },
        400,
      );
    }

    functionName =
      "tc_alert_opportunity";

    body = {
      ...body,
      p_priority:
        priority,
    };
  } else if (
    action.action
      === "seen"
  ) {
    functionName =
      "tc_mark_opportunity_seen";
  } else {
    functionName =
      "tc_create_trade_plan_request";
  }

  const result =
    await callRpc(
      functionName,
      body,
      env,
    );

  if (
    result.status
      === "unavailable"
  ) {
    return jsonResponse(
      {
        error:
          "workflow_store_unavailable",
      },
      503,
    );
  }

  return rpcResponse(
    result.value,
  );
}
