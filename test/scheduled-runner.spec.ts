import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  handleScheduledEvent,
} from "../worker/scheduled-runner";

import {
  systemAdapter,
} from "../worker/system-adapter";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const env = {
  APP_ENV: "dev",
  APP_NAME:
    "trading-company-hq",
  SUPABASE_URL:
    "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "test-key",
  EVENT_INGRESS_TOKEN:
    "test-token",
} as RuntimeEnv;

const controller = {
  cron:
    "*/15 * * * *",
  scheduledTime:
    Date.parse(
      "2026-09-14T03:45:00.000Z",
    ),
};

describe(
  "S03.3 scheduled execution",
  () => {
    it(
      "runs the internal adapter, persists heartbeat, then marks success",
      async () => {
        const runId =
          crypto.randomUUID();

        const order:
          string[] = [];

        const result =
          await handleScheduledEvent(
            controller,
            env,
            {
              beginRun:
                async () => ({
                  status:
                    "created",
                  run: {
                    id:
                      runId,
                    environment:
                      "dev",
                    job_key:
                      "system_heartbeat",
                    scheduled_for:
                      "2026-09-14T03:45:00.000Z",
                    status:
                      "running",
                  },
                }),

              markSucceeded:
                async () => {
                  order.push(
                    "succeeded",
                  );

                  return true;
                },

              markFailed:
                async () => {
                  order.push(
                    "failed",
                  );

                  return true;
                },

              persistHeartbeat:
                async () => {
                  order.push(
                    "heartbeat",
                  );

                  return true;
                },

              adapter: {
                ...systemAdapter,

                async execute(
                  input,
                  context,
                ) {
                  order.push(
                    "execute",
                  );

                  return systemAdapter
                    .execute(
                      input,
                      context,
                    );
                },
              },
            },
          );

        expect(result).toEqual({
          status:
            "succeeded",
          run_id:
            runId,
        });

        expect(order).toEqual([
          "execute",
          "heartbeat",
          "succeeded",
        ]);
      },
    );

    it(
      "deduplicates the same scheduled_for run before provider work",
      async () => {
        const runId =
          crypto.randomUUID();

        const execute =
          vi.fn(
            systemAdapter
              .execute,
          );

        const result =
          await handleScheduledEvent(
            controller,
            env,
            {
              beginRun:
                async () => ({
                  status:
                    "existing",
                  run: {
                    id:
                      runId,
                    environment:
                      "dev",
                    job_key:
                      "system_heartbeat",
                    scheduled_for:
                      "2026-09-14T03:45:00.000Z",
                    status:
                      "succeeded",
                  },
                }),

              markSucceeded:
                async () => true,

              markFailed:
                async () => true,

              persistHeartbeat:
                async () => true,

              adapter: {
                ...systemAdapter,
                execute,
              },
            },
          );

        expect(result).toEqual({
          status:
            "duplicate",
          run_id:
            runId,
        });

        expect(execute)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "refuses an unknown cron without provider work",
      async () => {
        const execute =
          vi.fn(
            systemAdapter
              .execute,
          );

        const result =
          await handleScheduledEvent(
            {
              cron:
                "0 * * * *",
              scheduledTime:
                controller
                  .scheduledTime,
            },
            env,
            {
              beginRun:
                async () => ({
                  status:
                    "unavailable",
                }),

              markSucceeded:
                async () => true,

              markFailed:
                async () => true,

              persistHeartbeat:
                async () => true,

              adapter: {
                ...systemAdapter,
                execute,
              },
            },
          );

        expect(result).toEqual({
          status:
            "unsupported_schedule",
        });

        expect(execute)
          .not.toHaveBeenCalled();
      },
    );

    it(
      "does not claim success when heartbeat persistence fails",
      async () => {
        const runId =
          crypto.randomUUID();

        const markFailed =
          vi.fn(
            async () => true,
          );

        const result =
          await handleScheduledEvent(
            controller,
            env,
            {
              beginRun:
                async () => ({
                  status:
                    "created",
                  run: {
                    id:
                      runId,
                    environment:
                      "dev",
                    job_key:
                      "system_heartbeat",
                    scheduled_for:
                      "2026-09-14T03:45:00.000Z",
                    status:
                      "running",
                  },
                }),

              markSucceeded:
                async () => true,

              markFailed,

              persistHeartbeat:
                async () => false,

              adapter:
                systemAdapter,
            },
          );

        expect(result).toEqual({
          status: "failed",
          failure_code:
            "heartbeat_persistence_failed",
          run_id:
            runId,
        });

        expect(markFailed)
          .toHaveBeenCalledWith(
            runId,
            "heartbeat_persistence_failed",
            {},
            env,
          );
      },
    );
  },
);
