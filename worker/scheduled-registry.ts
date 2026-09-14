export const SYSTEM_HEARTBEAT_CRON =
  "*/15 * * * *";

export interface ScheduledJobDefinition {
  key: "system_heartbeat";
  version: 1;
  cron: typeof SYSTEM_HEARTBEAT_CRON;
  adapterKey: "system_internal";
  timeoutMs: 5_000;
}

const systemHeartbeatJob:
  ScheduledJobDefinition = {
    key: "system_heartbeat",
    version: 1,
    cron: SYSTEM_HEARTBEAT_CRON,
    adapterKey: "system_internal",
    timeoutMs: 5_000,
  };

export function resolveScheduledJob(
  cron: string,
): ScheduledJobDefinition | null {
  if (
    cron === SYSTEM_HEARTBEAT_CRON
  ) {
    return systemHeartbeatJob;
  }

  return null;
}
