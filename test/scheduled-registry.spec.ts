import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveScheduledJob,
  SYSTEM_HEARTBEAT_CRON,
} from "../worker/scheduled-registry";

describe(
  "S03.3 scheduled registry",
  () => {
    it(
      "resolves the allowlisted heartbeat cron",
      () => {
        expect(
          resolveScheduledJob(
            SYSTEM_HEARTBEAT_CRON,
          ),
        ).toEqual({
          key:
            "system_heartbeat",
          version: 1,
          cron:
            SYSTEM_HEARTBEAT_CRON,
          adapterKey:
            "system_internal",
          timeoutMs: 5_000,
        });
      },
    );

    it(
      "rejects an unknown cron",
      () => {
        expect(
          resolveScheduledJob(
            "0 * * * *",
          ),
        ).toBeNull();
      },
    );
  },
);
