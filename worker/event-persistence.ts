import type { EventEnvelopeV1 } from "./event-envelope";

export interface RuntimeEnv extends Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EVENT_INGRESS_TOKEN: string;
}

export interface EventLedgerInsert extends Omit<EventEnvelopeV1, "correlation_id"> {
  id: string;
  environment: RuntimeEnv["APP_ENV"];
  request_id: string;
  correlation_id: string;
  request_body_sha256: string;
}

export type PersistEvent = (event: EventLedgerInsert, env: RuntimeEnv) => Promise<boolean>;

export const persistEvent: PersistEvent = async (event, env) => {
  let endpoint: URL;
  try {
    endpoint = new URL("/rest/v1/event_ledger", env.SUPABASE_URL);
  } catch {
    return false;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(event),
    });
    return response.status === 201;
  } catch {
    return false;
  }
};
