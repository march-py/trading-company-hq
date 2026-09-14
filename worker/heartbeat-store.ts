import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  isBoundedJson,
} from "./provider-adapter";

const MAX_HEARTBEAT_METADATA_BYTES =
  16_384;

export interface AutomationHeartbeatInput {
  environment:
    RuntimeEnv["APP_ENV"];
  component: string;
  source: string;
  status:
    "healthy"
    | "degraded"
    | "failed";
  observed_at: string;
  run_id:
    string | null;
  metadata:
    Record<string, unknown>;
}

export async function persistAutomationHeartbeat(
  heartbeat:
    AutomationHeartbeatInput,
  env: RuntimeEnv,
): Promise<boolean> {
  if (
    !isBoundedJson(
      heartbeat.metadata,
      MAX_HEARTBEAT_METADATA_BYTES,
    )
  ) {
    return false;
  }

  let endpoint: URL;

  try {
    endpoint = new URL(
      "/rest/v1/automation_heartbeats",
      env.SUPABASE_URL,
    );
  } catch {
    return false;
  }

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            apikey:
              env.SUPABASE_SERVICE_ROLE_KEY,
            authorization:
              `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "content-type":
              "application/json",
            prefer:
              "return=minimal",
          },
          body:
            JSON.stringify(
              heartbeat,
            ),
        },
      );

    return (
      response.status === 201
    );
  } catch {
    return false;
  }
}
