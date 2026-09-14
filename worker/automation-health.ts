import type {
  RuntimeEnv,
} from "./event-persistence";

export type SchedulerHealthStatus =
  | "healthy"
  | "stale"
  | "unavailable";

export interface AutomationHealthSnapshot {
  environment:
    RuntimeEnv["APP_ENV"];
  scheduler_status:
    SchedulerHealthStatus;
  latest_heartbeat_observed_at:
    string | null;
  latest_scheduled_run_status:
    string | null;
  recent_failure_count:
    number;
  server_time:
    string;
}

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

function unavailable(
  env: RuntimeEnv,
  now: Date,
): AutomationHealthSnapshot {
  return {
    environment:
      env.APP_ENV,
    scheduler_status:
      "unavailable",
    latest_heartbeat_observed_at:
      null,
    latest_scheduled_run_status:
      null,
    recent_failure_count:
      0,
    server_time:
      now.toISOString(),
  };
}

export async function readAutomationHealth(
  env: RuntimeEnv,
  now = new Date(),
): Promise<
  AutomationHealthSnapshot
> {
  let heartbeatUrl: URL;
  let runsUrl: URL;

  try {
    heartbeatUrl = new URL(
      "/rest/v1/automation_heartbeats",
      env.SUPABASE_URL,
    );

    runsUrl = new URL(
      "/rest/v1/automation_runs",
      env.SUPABASE_URL,
    );
  } catch {
    return unavailable(
      env,
      now,
    );
  }

  heartbeatUrl.searchParams.set(
    "select",
    "observed_at,status",
  );

  heartbeatUrl.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  heartbeatUrl.searchParams.set(
    "component",
    "eq.scheduler",
  );

  heartbeatUrl.searchParams.set(
    "order",
    "observed_at.desc",
  );

  heartbeatUrl.searchParams.set(
    "limit",
    "1",
  );

  const windowStart =
    new Date(
      now.getTime()
      - 24 * 60 * 60 * 1000,
    ).toISOString();

  runsUrl.searchParams.set(
    "select",
    "status,scheduled_for",
  );

  runsUrl.searchParams.set(
    "environment",
    `eq.${env.APP_ENV}`,
  );

  runsUrl.searchParams.set(
    "scheduled_for",
    `gte.${windowStart}`,
  );

  runsUrl.searchParams.set(
    "order",
    "scheduled_for.desc",
  );

  runsUrl.searchParams.set(
    "limit",
    "100",
  );

  try {
    const [
      heartbeatResponse,
      runsResponse,
    ] = await Promise.all([
      fetch(
        heartbeatUrl,
        {
          headers:
            headers(env),
        },
      ),
      fetch(
        runsUrl,
        {
          headers:
            headers(env),
        },
      ),
    ]);

    if (
      heartbeatResponse.status
        !== 200
      || runsResponse.status
        !== 200
    ) {
      return unavailable(
        env,
        now,
      );
    }

    const heartbeats: unknown =
      await heartbeatResponse
        .json();

    const runs: unknown =
      await runsResponse
        .json();

    if (
      !Array.isArray(
        heartbeats,
      )
      || !Array.isArray(runs)
    ) {
      return unavailable(
        env,
        now,
      );
    }

    let latestObserved:
      string | null = null;

    if (
      heartbeats.length > 0
    ) {
      const first =
        heartbeats[0];

      if (
        typeof first
          !== "object"
        || first === null
        || Array.isArray(first)
        || typeof (
          first as Record<
            string,
            unknown
          >
        ).observed_at
          !== "string"
      ) {
        return unavailable(
          env,
          now,
        );
      }

      latestObserved =
        (
          first as Record<
            string,
            unknown
          >
        ).observed_at as string;
    }

    let latestRunStatus:
      string | null = null;

    let failureCount = 0;

    for (
      const run
      of runs
    ) {
      if (
        typeof run
          !== "object"
        || run === null
        || Array.isArray(run)
      ) {
        return unavailable(
          env,
          now,
        );
      }

      const status =
        (
          run as Record<
            string,
            unknown
          >
        ).status;

      if (
        typeof status
          !== "string"
      ) {
        return unavailable(
          env,
          now,
        );
      }

      if (
        latestRunStatus
        === null
      ) {
        latestRunStatus =
          status;
      }

      if (
        status === "failed"
      ) {
        failureCount += 1;
      }
    }

    if (
      latestObserved
      === null
    ) {
      return {
        environment:
          env.APP_ENV,
        scheduler_status:
          "unavailable",
        latest_heartbeat_observed_at:
          null,
        latest_scheduled_run_status:
          latestRunStatus,
        recent_failure_count:
          failureCount,
        server_time:
          now.toISOString(),
      };
    }

    const observedMs =
      Date.parse(
        latestObserved,
      );

    if (
      !Number.isFinite(
        observedMs,
      )
    ) {
      return unavailable(
        env,
        now,
      );
    }

    const ageMs =
      now.getTime()
      - observedMs;

    return {
      environment:
        env.APP_ENV,
      scheduler_status:
        ageMs
          <= 45 * 60 * 1000
          ? "healthy"
          : "stale",
      latest_heartbeat_observed_at:
        latestObserved,
      latest_scheduled_run_status:
        latestRunStatus,
      recent_failure_count:
        failureCount,
      server_time:
        now.toISOString(),
    };
  } catch {
    return unavailable(
      env,
      now,
    );
  }
}
