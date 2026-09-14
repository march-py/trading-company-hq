import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  readAutomationHealth,
} from "../worker/automation-health";

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

afterEach(() => {
  vi.restoreAllMocks();
});

const now =
  new Date(
    "2026-09-14T04:00:00.000Z",
  );

function jsonResponse(
  value: unknown,
) {
  return new Response(
    JSON.stringify(value),
    {
      status: 200,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

describe(
  "S03.3 automation health",
  () => {
    it(
      "reports healthy for a recent heartbeat",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        )
          .mockResolvedValueOnce(
            jsonResponse([
              {
                observed_at:
                  "2026-09-14T03:45:00.000Z",
                status:
                  "healthy",
              },
            ]),
          )
          .mockResolvedValueOnce(
            jsonResponse([
              {
                status:
                  "succeeded",
                scheduled_for:
                  "2026-09-14T03:45:00.000Z",
              },
              {
                status:
                  "failed",
                scheduled_for:
                  "2026-09-14T03:30:00.000Z",
              },
            ]),
          );

        await expect(
          readAutomationHealth(
            env,
            now,
          ),
        ).resolves.toEqual({
          environment:
            "dev",
          scheduler_status:
            "healthy",
          latest_heartbeat_observed_at:
            "2026-09-14T03:45:00.000Z",
          latest_scheduled_run_status:
            "succeeded",
          recent_failure_count:
            1,
          server_time:
            "2026-09-14T04:00:00.000Z",
        });
      },
    );

    it(
      "reports stale beyond the 45-minute threshold",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        )
          .mockResolvedValueOnce(
            jsonResponse([
              {
                observed_at:
                  "2026-09-14T03:00:00.000Z",
                status:
                  "healthy",
              },
            ]),
          )
          .mockResolvedValueOnce(
            jsonResponse([]),
          );

        const result =
          await readAutomationHealth(
            env,
            now,
          );

        expect(
          result.scheduler_status,
        ).toBe("stale");
      },
    );

    it(
      "reports unavailable when no heartbeat exists",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        )
          .mockResolvedValueOnce(
            jsonResponse([]),
          )
          .mockResolvedValueOnce(
            jsonResponse([]),
          );

        const result =
          await readAutomationHealth(
            env,
            now,
          );

        expect(
          result.scheduler_status,
        ).toBe(
          "unavailable",
        );
      },
    );

    it(
      "reports unavailable when durable lookup fails",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 503,
              },
            ),
          )
          .mockResolvedValueOnce(
            jsonResponse([]),
          );

        const result =
          await readAutomationHealth(
            env,
            now,
          );

        expect(
          result.scheduler_status,
        ).toBe(
          "unavailable",
        );
      },
    );
  },
);
