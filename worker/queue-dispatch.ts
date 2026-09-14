import type { RuntimeEnv } from "./event-persistence";

export interface EventQueueMessageV1 {
  queue_contract_version: 1;
  event_id: string;
  environment: RuntimeEnv["APP_ENV"];
}

export interface EventQueueSender {
  send(message: EventQueueMessageV1): Promise<void>;
}

type QueueRuntimeEnv = RuntimeEnv & {
  EVENT_QUEUE?: EventQueueSender;
};

export type DispatchEvent = (
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  env: RuntimeEnv,
) => Promise<boolean>;

export const dispatchEvent: DispatchEvent = async (
  eventId,
  environment,
  env,
) => {
  const queue = (env as QueueRuntimeEnv).EVENT_QUEUE;

  if (
    queue === undefined
    || typeof queue.send !== "function"
  ) {
    return false;
  }

  const message: EventQueueMessageV1 = {
    queue_contract_version: 1,
    event_id: eventId,
    environment,
  };

  try {
    await queue.send(message);
    return true;
  } catch {
    return false;
  }
};
