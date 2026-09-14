import {
  describe,
  expect,
  it,
} from "vitest";

import {
  systemAdapter,
} from "../worker/system-adapter";

describe(
  "S03.3 internal system adapter",
  () => {
    const context = {
      environment:
        "dev" as const,
      scheduledFor:
        "2026-09-14T03:45:00.000Z",
      runId:
        crypto.randomUUID(),
    };

    it(
      "reports healthy without an external provider",
      async () => {
        await expect(
          systemAdapter
            .healthCheck(
              context,
            ),
        ).resolves.toEqual({
          ok: true,
          status: "healthy",
        });
      },
    );

    it(
      "executes the heartbeat job",
      async () => {
        await expect(
          systemAdapter.execute(
            {
              jobKey:
                "system_heartbeat",
            },
            context,
          ),
        ).resolves.toEqual({
          ok: true,
          value: {
            component:
              "scheduler",
            source:
              "cloudflare_cron",
            status:
              "healthy",
          },
        });
      },
    );
  },
);
