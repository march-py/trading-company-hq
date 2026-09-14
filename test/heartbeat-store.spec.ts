import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  persistAutomationHeartbeat,
} from "../worker/heartbeat-store";

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

describe(
  "S03.3 heartbeat store",
  () => {
    it(
      "persists a bounded heartbeat",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              null,
              {
                status: 201,
              },
            ),
          );

        await expect(
          persistAutomationHeartbeat(
            {
              environment:
                "dev",
              component:
                "scheduler",
              source:
                "cloudflare_cron",
              status:
                "healthy",
              observed_at:
                "2026-09-14T03:45:01.000Z",
              run_id:
                crypto.randomUUID(),
              metadata: {
                job_key:
                  "system_heartbeat",
              },
            },
            env,
          ),
        ).resolves.toBe(true);

        expect(fetchMock)
          .toHaveBeenCalledOnce();
      },
    );

    it(
      "rejects oversized metadata before persistence",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          );

        await expect(
          persistAutomationHeartbeat(
            {
              environment:
                "dev",
              component:
                "scheduler",
              source:
                "cloudflare_cron",
              status:
                "healthy",
              observed_at:
                "2026-09-14T03:45:01.000Z",
              run_id: null,
              metadata: {
                payload:
                  "x".repeat(
                    20_000,
                  ),
              },
            },
            env,
          ),
        ).resolves.toBe(false);

        expect(fetchMock)
          .not.toHaveBeenCalled();
      },
    );
  },
);
