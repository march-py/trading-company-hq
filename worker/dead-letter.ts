import type { RuntimeEnv } from "./event-persistence";
import {
  isEventQueueMessageV1,
  QUEUE_RETRY_DELAY_SECONDS,
  type QueueBatchLike,
  type QueueMessageLike,
} from "./queue-consumer";

export type DeadLetterFailureCode =
  | "invalid_queue_message"
  | "processing_failed";

export interface DeadLetterRecord {
  event_id: string | null;
  environment: RuntimeEnv["APP_ENV"];
  queue_message_id: string;
  failure_code: DeadLetterFailureCode;
  payload: Record<string, unknown>;
}

export type StoreDeadLetter = (
  record: DeadLetterRecord,
  env: RuntimeEnv,
) => Promise<boolean>;

function runtimeHeaders(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function safePayload(
  body: unknown,
): Record<string, unknown> {
  if (!isEventQueueMessageV1(body)) {
    return {
      queue_contract_version: null,
      valid_queue_message: false,
    };
  }

  return {
    queue_contract_version:
      body.queue_contract_version,
    event_id:
      body.event_id,
    environment:
      body.environment,
    valid_queue_message: true,
  };
}

export const storeDeadLetter:
  StoreDeadLetter =
  async (
    record,
    env,
  ) => {
    let endpoint: URL;

    try {
      endpoint = new URL(
        "/rest/v1/event_dead_letters",
        env.SUPABASE_URL,
      );
    } catch {
      return false;
    }

    try {
      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            ...runtimeHeaders(env),
            "content-type":
              "application/json",
            prefer:
              "return=minimal",
          },
          body: JSON.stringify(
            record,
          ),
        },
      );

      if (response.status === 201) {
        return true;
      }

      if (response.status !== 409) {
        return false;
      }
    } catch {
      return false;
    }

    endpoint.search = "";

    endpoint.searchParams.set(
      "select",
      "queue_message_id",
    );

    endpoint.searchParams.set(
      "queue_message_id",
      `eq.${record.queue_message_id}`,
    );

    endpoint.searchParams.set(
      "limit",
      "1",
    );

    try {
      const response = await fetch(
        endpoint,
        {
          method: "GET",
          headers:
            runtimeHeaders(env),
        },
      );

      if (response.status !== 200) {
        return false;
      }

      const decoded: unknown =
        await response.json();

      return (
        Array.isArray(decoded)
        && decoded.length === 1
        && typeof decoded[0] === "object"
        && decoded[0] !== null
        && !Array.isArray(decoded[0])
        && (
          decoded[0] as Record<
            string,
            unknown
          >
        ).queue_message_id
          === record.queue_message_id
      );
    } catch {
      return false;
    }
  };

function retryMessage(
  message: QueueMessageLike,
): void {
  message.retry({
    delaySeconds:
      QUEUE_RETRY_DELAY_SECONDS,
  });
}

export async function handleDeadLetterMessage(
  message: QueueMessageLike,
  env: RuntimeEnv,
  store: StoreDeadLetter =
    storeDeadLetter,
): Promise<void> {
  const body = message.body;

  const valid =
    isEventQueueMessageV1(
      body,
    );

  const stored = await store(
    {
      event_id:
        valid
          ? body.event_id
          : null,

      environment:
        valid
          ? body.environment
          : env.APP_ENV,

      queue_message_id:
        message.id,

      failure_code:
        valid
          ? "processing_failed"
          : "invalid_queue_message",

      payload:
        safePayload(
          body,
        ),
    },
    env,
  );

  if (!stored) {
    retryMessage(message);
    return;
  }

  message.ack();
}

export async function handleDeadLetterBatch(
  batch: QueueBatchLike,
  env: RuntimeEnv,
  store: StoreDeadLetter =
    storeDeadLetter,
): Promise<void> {
  for (
    const message
    of batch.messages
  ) {
    await handleDeadLetterMessage(
      message,
      env,
      store,
    );
  }
}
