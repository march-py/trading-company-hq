import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  beginAutomationRun,
  markAutomationRunFailed,
  markAutomationRunSucceeded,
} from "../worker/automation-store";

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

const input = {
  environment:
    "dev" as const,
  job_key:
    "system_heartbeat",
  job_version: 1,
  adapter_key:
    "system_internal",
  scheduled_for:
    "2026-09-14T03:45:00.000Z",
  metadata: {
    trigger:
      "cloudflare_cron",
  },
};

describe(
  "S03.3 automation run store",
  () => {
    it(
      "creates a new run after confirming no duplicate exists",
      async () => {
        const id =
          crypto.randomUUID();

        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([]),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  id,
                  environment:
                    "dev",
                  job_key:
                    "system_heartbeat",
                  scheduled_for:
                    input.scheduled_for,
                  status:
                    "running",
                },
              ]),
              {
                status: 201,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          );

        await expect(
          beginAutomationRun(
            input,
            env,
          ),
        ).resolves.toEqual({
          status: "created",
          run: {
            id,
            environment:
              "dev",
            job_key:
              "system_heartbeat",
            scheduled_for:
              input.scheduled_for,
            status:
              "running",
          },
        });

        expect(fetchMock)
          .toHaveBeenCalledTimes(2);
      },
    );

    it(
      "returns an existing run without inserting duplicate work",
      async () => {
        const id =
          crypto.randomUUID();

        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  id,
                  environment:
                    "dev",
                  job_key:
                    "system_heartbeat",
                  scheduled_for:
                    input.scheduled_for,
                  status:
                    "succeeded",
                },
              ]),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          );

        await expect(
          beginAutomationRun(
            input,
            env,
          ),
        ).resolves.toEqual({
          status: "existing",
          run: {
            id,
            environment:
              "dev",
            job_key:
              "system_heartbeat",
            scheduled_for:
              input.scheduled_for,
            status:
              "succeeded",
          },
        });

        expect(fetchMock)
          .toHaveBeenCalledTimes(1);
      },
    );

    it(
      "marks successful and failed states through bounded patches",
      async () => {
        const fetchMock = vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValue(
            new Response(
              null,
              {
                status: 204,
              },
            ),
          );

        const runId =
          crypto.randomUUID();

        await expect(
          markAutomationRunSucceeded(
            runId,
            {
              adapter_version: 1,
            },
            env,
          ),
        ).resolves.toBe(true);

        await expect(
          markAutomationRunFailed(
            runId,
            "adapter_failed",
            {},
            env,
          ),
        ).resolves.toBe(true);

        expect(fetchMock)
          .toHaveBeenCalledTimes(2);
      },
    );
  },
);
