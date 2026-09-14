import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  beginAutomationRun,
  markAutomationRunFailed,
  markAutomationRunSucceeded,
  type BeginAutomationRunResult,
} from "./automation-store";

import {
  persistAutomationHeartbeat,
} from "./heartbeat-store";

import {
  isBoundedJson,
  type ProviderAdapter,
} from "./provider-adapter";

import {
  resolveScheduledJob,
} from "./scheduled-registry";

import {
  systemAdapter,
  type SystemHeartbeatInput,
  type SystemHeartbeatOutput,
} from "./system-adapter";

export interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}

export type ScheduledRunResult =
  | {
      status: "succeeded";
      run_id: string;
    }
  | {
      status: "duplicate";
      run_id: string;
    }
  | {
      status: "unsupported_schedule";
    }
  | {
      status: "failed";
      failure_code: string;
      run_id:
        string | null;
    }
  | {
      status: "unavailable";
      run_id:
        string | null;
    };

interface ScheduledDependencies {
  beginRun(
    input: Parameters<
      typeof beginAutomationRun
    >[0],
    env: RuntimeEnv,
  ): Promise<
    BeginAutomationRunResult
  >;

  markSucceeded:
    typeof markAutomationRunSucceeded;

  markFailed:
    typeof markAutomationRunFailed;

  persistHeartbeat:
    typeof persistAutomationHeartbeat;

  adapter:
    ProviderAdapter<
      SystemHeartbeatInput,
      SystemHeartbeatOutput
    >;
}

const defaultDependencies:
  ScheduledDependencies = {
    beginRun:
      beginAutomationRun,
    markSucceeded:
      markAutomationRunSucceeded,
    markFailed:
      markAutomationRunFailed,
    persistHeartbeat:
      persistAutomationHeartbeat,
    adapter:
      systemAdapter,
  };

async function executeWithTimeout<T>(
  operation:
    Promise<T>,
  timeoutMs: number,
): Promise<
  | {
      status: "completed";
      value: T;
    }
  | {
      status: "timeout";
    }
> {
  let timer:
    ReturnType<typeof setTimeout>
    | undefined;

  try {
    return await Promise.race([
      operation.then(
        (value) => ({
          status:
            "completed" as const,
          value,
        }),
      ),

      new Promise<{
        status: "timeout";
      }>((resolve) => {
        timer = setTimeout(
          () => {
            resolve({
              status: "timeout",
            });
          },
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function handleScheduledEvent(
  controller:
    ScheduledControllerLike,
  env: RuntimeEnv,
  dependencies:
    ScheduledDependencies =
      defaultDependencies,
): Promise<
  ScheduledRunResult
> {
  const job =
    resolveScheduledJob(
      controller.cron,
    );

  if (job === null) {
    console.warn(
      "unsupported_schedule",
    );

    return {
      status:
        "unsupported_schedule",
    };
  }

  const scheduledFor =
    new Date(
      controller.scheduledTime,
    ).toISOString();

  const begun =
    await dependencies.beginRun(
      {
        environment:
          env.APP_ENV,
        job_key:
          job.key,
        job_version:
          job.version,
        adapter_key:
          job.adapterKey,
        scheduled_for:
          scheduledFor,
        metadata: {
          trigger:
            "cloudflare_cron",
        },
      },
      env,
    );

  if (
    begun.status
    === "unavailable"
  ) {
    return {
      status: "unavailable",
      run_id: null,
    };
  }

  if (
    begun.status
    === "existing"
  ) {
    return {
      status: "duplicate",
      run_id:
        begun.run.id,
    };
  }

  const runId =
    begun.run.id;

  const context = {
    environment:
      env.APP_ENV,
    scheduledFor,
    runId,
  };

  const health =
    await dependencies
      .adapter
      .healthCheck(
        context,
      );

  if (!health.ok) {
    await dependencies
      .markFailed(
        runId,
        health.failure_code,
        {
          adapter_status:
            health.status,
        },
        env,
      );

    return {
      status: "failed",
      failure_code:
        health.failure_code,
      run_id: runId,
    };
  }

  const execution =
    await executeWithTimeout(
      dependencies
        .adapter
        .execute(
          {
            jobKey:
              "system_heartbeat",
          },
          context,
        ),
      job.timeoutMs,
    );

  if (
    execution.status
    === "timeout"
  ) {
    await dependencies
      .markFailed(
        runId,
        "adapter_timeout",
        {},
        env,
      );

    return {
      status: "failed",
      failure_code:
        "adapter_timeout",
      run_id: runId,
    };
  }

  if (
    !execution.value.ok
  ) {
    await dependencies
      .markFailed(
        runId,
        execution.value
          .failure_code,
        {},
        env,
      );

    return {
      status: "failed",
      failure_code:
        execution.value
          .failure_code,
      run_id: runId,
    };
  }

  if (
    !isBoundedJson(
      execution.value.value,
      8_192,
    )
  ) {
    await dependencies
      .markFailed(
        runId,
        "adapter_result_too_large",
        {},
        env,
      );

    return {
      status: "failed",
      failure_code:
        "adapter_result_too_large",
      run_id: runId,
    };
  }

  const observedAt =
    new Date().toISOString();

  const heartbeatSaved =
    await dependencies
      .persistHeartbeat(
        {
          environment:
            env.APP_ENV,
          component:
            execution.value
              .value.component,
          source:
            execution.value
              .value.source,
          status:
            execution.value
              .value.status,
          observed_at:
            observedAt,
          run_id:
            runId,
          metadata: {
            job_key:
              job.key,
            job_version:
              job.version,
            adapter_key:
              dependencies
                .adapter.key,
            adapter_version:
              dependencies
                .adapter.version,
          },
        },
        env,
      );

  if (!heartbeatSaved) {
    await dependencies
      .markFailed(
        runId,
        "heartbeat_persistence_failed",
        {},
        env,
      );

    return {
      status: "failed",
      failure_code:
        "heartbeat_persistence_failed",
      run_id: runId,
    };
  }

  const succeeded =
    await dependencies
      .markSucceeded(
        runId,
        {
          heartbeat_observed_at:
            observedAt,
          adapter_key:
            dependencies
              .adapter.key,
          adapter_version:
            dependencies
              .adapter.version,
        },
        env,
      );

  if (!succeeded) {
    return {
      status: "unavailable",
      run_id: runId,
    };
  }

  return {
    status: "succeeded",
    run_id: runId,
  };
}
