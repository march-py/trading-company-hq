import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  isBoundedJson,
} from "./provider-adapter";

export type AutomationRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface AutomationRunIdentity {
  id: string;
  environment:
    RuntimeEnv["APP_ENV"];
  job_key: string;
  scheduled_for: string;
  status:
    AutomationRunStatus;
}

export interface BeginAutomationRunInput {
  environment:
    RuntimeEnv["APP_ENV"];
  job_key: string;
  job_version: number;
  adapter_key: string;
  scheduled_for: string;
  metadata:
    Record<string, unknown>;
}

export type BeginAutomationRunResult =
  | {
      status: "created";
      run:
        AutomationRunIdentity;
    }
  | {
      status: "existing";
      run:
        AutomationRunIdentity;
    }
  | {
      status: "unavailable";
    };

const MAX_RUN_METADATA_BYTES =
  16_384;

function headers(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey:
      env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isRun(
  value: unknown,
): value is AutomationRunIdentity {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof row.id === "string"
    && (
      row.environment === "dev"
      || row.environment === "prod"
    )
    && typeof row.job_key
      === "string"
    && typeof row.scheduled_for
      === "string"
    && (
      row.status === "running"
      || row.status === "succeeded"
      || row.status === "failed"
      || row.status === "skipped"
    )
  );
}

async function findExisting(
  input:
    BeginAutomationRunInput,
  env: RuntimeEnv,
): Promise<
  AutomationRunIdentity | null | false
> {
  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/automation_runs",
      env.SUPABASE_URL,
    );
  } catch {
    return false;
  }

  endpoint.searchParams.set(
    "select",
    "id,environment,job_key,scheduled_for,status",
  );

  endpoint.searchParams.set(
    "environment",
    `eq.${input.environment}`,
  );

  endpoint.searchParams.set(
    "job_key",
    `eq.${input.job_key}`,
  );

  endpoint.searchParams.set(
    "scheduled_for",
    `eq.${input.scheduled_for}`,
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
          headers:
            headers(env),
        },
      );

    if (
      response.status
      !== 200
    ) {
      return false;
    }

    const decoded: unknown =
      await response.json();

    if (
      !Array.isArray(decoded)
    ) {
      return false;
    }

    if (
      decoded.length === 0
    ) {
      return null;
    }

    if (
      !isRun(decoded[0])
    ) {
      return false;
    }

    return decoded[0];
  } catch {
    return false;
  }
}

export async function beginAutomationRun(
  input:
    BeginAutomationRunInput,
  env: RuntimeEnv,
): Promise<
  BeginAutomationRunResult
> {
  if (
    !isBoundedJson(
      input.metadata,
      MAX_RUN_METADATA_BYTES,
    )
  ) {
    return {
      status: "unavailable",
    };
  }

  const existing =
    await findExisting(
      input,
      env,
    );

  if (existing === false) {
    return {
      status: "unavailable",
    };
  }

  if (existing !== null) {
    return {
      status: "existing",
      run: existing,
    };
  }

  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/automation_runs",
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
            ...headers(env),
            "content-type":
              "application/json",
            prefer:
              "return=representation",
          },
          body: JSON.stringify({
            ...input,
            status: "running",
          }),
        },
      );

    if (
      response.status === 201
    ) {
      const decoded: unknown =
        await response.json();

      if (
        Array.isArray(decoded)
        && decoded.length === 1
        && isRun(decoded[0])
      ) {
        return {
          status: "created",
          run: decoded[0],
        };
      }

      return {
        status: "unavailable",
      };
    }

    if (
      response.status === 409
    ) {
      const raced =
        await findExisting(
          input,
          env,
        );

      if (
        raced !== false
        && raced !== null
      ) {
        return {
          status: "existing",
          run: raced,
        };
      }
    }

    return {
      status: "unavailable",
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

async function updateRun(
  runId: string,
  body:
    Record<string, unknown>,
  env: RuntimeEnv,
): Promise<boolean> {
  if (
    body.metadata !== undefined
    && !isBoundedJson(
      body.metadata,
      MAX_RUN_METADATA_BYTES,
    )
  ) {
    return false;
  }

  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/automation_runs",
      env.SUPABASE_URL,
    );
  } catch {
    return false;
  }

  endpoint.searchParams.set(
    "id",
    `eq.${runId}`,
  );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "PATCH",
          headers: {
            ...headers(env),
            "content-type":
              "application/json",
            prefer:
              "return=minimal",
          },
          body:
            JSON.stringify(body),
        },
      );

    return (
      response.status === 200
      || response.status === 204
    );
  } catch {
    return false;
  }
}

export async function markAutomationRunSucceeded(
  runId: string,
  metadata:
    Record<string, unknown>,
  env: RuntimeEnv,
): Promise<boolean> {
  return updateRun(
    runId,
    {
      status: "succeeded",
      finished_at:
        new Date().toISOString(),
      failure_code: null,
      metadata,
    },
    env,
  );
}

export async function markAutomationRunFailed(
  runId: string,
  failureCode: string,
  metadata:
    Record<string, unknown>,
  env: RuntimeEnv,
): Promise<boolean> {
  return updateRun(
    runId,
    {
      status: "failed",
      finished_at:
        new Date().toISOString(),
      failure_code:
        failureCode,
      metadata,
    },
    env,
  );
}
