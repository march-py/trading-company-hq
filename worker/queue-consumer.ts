import type { RuntimeEnv } from "./event-persistence";
import type { EventQueueMessageV1 } from "./queue-dispatch";

import {
  beginProcessingReceipt,
  markProcessingSucceeded,
  recordProcessingFailure,
  type BeginProcessingResult,
} from "./processing-store";

import {
  materializeOpportunityForEvent,
  type OpportunityMaterializationResult,
} from "./opportunity-store";

import {
  captureTriggerSnapshotForOpportunity,
  ensureOpportunitySnapshotSchedule,
} from "./opportunity-snapshot";

export const QUEUE_RETRY_DELAY_SECONDS = 30;

export interface QueueMessageLike {
  id: string;
  body: unknown;
  ack(): void;
  retry(options?: {
    delaySeconds?: number;
  }): void;
}

export interface QueueBatchLike {
  queue: string;
  messages: readonly QueueMessageLike[];
}

interface CanonicalEventIdentity {
  id: string;
  environment: RuntimeEnv["APP_ENV"];
}

export type CanonicalEventResult =
  | {
      status: "found";
      event: CanonicalEventIdentity;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
    };

export type ReadCanonicalEvent = (
  eventId: string,
  env: RuntimeEnv,
) => Promise<CanonicalEventResult>;

export type BeginReceipt = (
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  env: RuntimeEnv,
) => Promise<BeginProcessingResult>;

export type MarkSucceeded = (
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  env: RuntimeEnv,
) => Promise<boolean>;

export type RecordFailure = (
  eventId: string,
  environment: RuntimeEnv["APP_ENV"],
  queueMessageId: string,
  failureCode: string,
  env: RuntimeEnv,
) => Promise<boolean>;

export type ProcessOpportunity = (
  eventId: string,
  env: RuntimeEnv,
) => Promise<OpportunityMaterializationResult>;

export type PostProcessOpportunity = (
  opportunityId: string,
  env: RuntimeEnv,
) => Promise<void>;

export interface QueueConsumerDependencies {
  readCanonicalEvent: ReadCanonicalEvent;
  beginReceipt: BeginReceipt;
  markSucceeded: MarkSucceeded;
  recordFailure: RecordFailure;
  processOpportunity?: ProcessOpportunity;
  postProcessOpportunity?: PostProcessOpportunity;
}

function runtimeHeaders(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey:
      env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isEventQueueMessageV1(
  value: unknown,
): value is EventQueueMessageV1 {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const message =
    value as Record<string, unknown>;

  const keys =
    Object.keys(message).sort();

  if (
    keys.length !== 3
    || keys[0] !== "environment"
    || keys[1] !== "event_id"
    || keys[2] !== "queue_contract_version"
  ) {
    return false;
  }

  return (
    message.queue_contract_version === 1
    && typeof message.event_id === "string"
    && isUuid(message.event_id)
    && (
      message.environment === "dev"
      || message.environment === "prod"
    )
  );
}

export const readCanonicalEvent:
  ReadCanonicalEvent =
  async (
    eventId,
    env,
  ) => {
    let endpoint: URL;

    try {
      endpoint = new URL(
        "/rest/v1/event_ledger",
        env.SUPABASE_URL,
      );
    } catch {
      return {
        status: "unavailable",
      };
    }

    endpoint.searchParams.set(
      "select",
      "id,environment",
    );

    endpoint.searchParams.set(
      "id",
      `eq.${eventId}`,
    );

    endpoint.searchParams.set(
      "limit",
      "1",
    );

    try {
      const response =
        await fetch(
          endpoint,
          {
            method: "GET",
            headers:
              runtimeHeaders(env),
          },
        );

      if (response.status !== 200) {
        return {
          status: "unavailable",
        };
      }

      const decoded: unknown =
        await response.json();

      if (!Array.isArray(decoded)) {
        return {
          status: "unavailable",
        };
      }

      if (decoded.length === 0) {
        return {
          status: "missing",
        };
      }

      const row = decoded[0];

      if (
        typeof row !== "object"
        || row === null
        || Array.isArray(row)
      ) {
        return {
          status: "unavailable",
        };
      }

      const record =
        row as Record<
          string,
          unknown
        >;

      if (
        typeof record.id !== "string"
        || !isUuid(record.id)
        || (
          record.environment !== "dev"
          && record.environment !== "prod"
        )
      ) {
        return {
          status: "unavailable",
        };
      }

      return {
        status: "found",
        event: {
          id: record.id,
          environment:
            record.environment,
        },
      };
    } catch {
      return {
        status: "unavailable",
      };
    }
  };

const defaultDependencies:
  QueueConsumerDependencies = {
    readCanonicalEvent,
    beginReceipt:
      beginProcessingReceipt,
    markSucceeded:
      markProcessingSucceeded,
    recordFailure:
      recordProcessingFailure,
    processOpportunity:
      materializeOpportunityForEvent,
    postProcessOpportunity:
      async (
        opportunityId,
        env,
      ) => {
        const scheduled =
          await ensureOpportunitySnapshotSchedule(
            opportunityId,
            env,
          );

        if (!scheduled) {
          return;
        }

        await captureTriggerSnapshotForOpportunity(
          opportunityId,
          env,
        );
      },
  };

function retryMessage(
  message: QueueMessageLike,
): void {
  message.retry({
    delaySeconds:
      QUEUE_RETRY_DELAY_SECONDS,
  });
}

export async function handleMainQueueMessage(
  message: QueueMessageLike,
  env: RuntimeEnv,
  dependencies:
    QueueConsumerDependencies =
      defaultDependencies,
): Promise<void> {
  if (
    !isEventQueueMessageV1(
      message.body,
    )
  ) {
    retryMessage(message);
    return;
  }

  const queueMessage =
    message.body;

  const canonical =
    await dependencies
      .readCanonicalEvent(
        queueMessage.event_id,
        env,
      );

  if (
    canonical.status
    === "unavailable"
  ) {
    retryMessage(message);
    return;
  }

  if (
    canonical.status
    === "missing"
  ) {
    retryMessage(message);
    return;
  }

  if (
    canonical.event.environment
    !== queueMessage.environment
    || canonical.event.environment
      !== env.APP_ENV
  ) {
    retryMessage(message);
    return;
  }

  const receipt =
    await dependencies.beginReceipt(
      canonical.event.id,
      canonical.event.environment,
      message.id,
      env,
    );

  if (
    receipt.status
    === "unavailable"
  ) {
    retryMessage(message);
    return;
  }

  if (
    receipt.status
    === "already_succeeded"
  ) {
    message.ack();
    return;
  }

  let materializedOpportunityId:
    string | null = null;

  if (
    dependencies.processOpportunity
  ) {
    const opportunity =
      await dependencies
        .processOpportunity(
          canonical.event.id,
          env,
        );

    if (
      opportunity.status === "created"
      || opportunity.status === "replay"
    ) {
      materializedOpportunityId =
        opportunity.opportunity_id;
    }

    let failureCode:
      string | null = null;

    if (
      opportunity.status
      === "unavailable"
    ) {
      failureCode =
        "opportunity_store_unavailable";
    } else if (
      opportunity.status
      === "unresolved_instrument"
    ) {
      failureCode =
        "unresolved_instrument";
    } else if (
      opportunity.status
      === "invalid"
    ) {
      failureCode =
        "invalid_tradingview_event";
    } else if (
      opportunity.status
      === "conflict"
    ) {
      failureCode =
        "opportunity_dedupe_conflict";
    }

    if (failureCode !== null) {
      await dependencies
        .recordFailure(
          canonical.event.id,
          canonical.event.environment,
          message.id,
          failureCode,
          env,
        );

      retryMessage(message);
      return;
    }
  }

  const marked =
    await dependencies
      .markSucceeded(
        canonical.event.id,
        canonical.event.environment,
        message.id,
        env,
      );

  if (!marked) {
    await dependencies
      .recordFailure(
        canonical.event.id,
        canonical.event.environment,
        message.id,
        "processing_store_unavailable",
        env,
      );

    retryMessage(message);
    return;
  }

  message.ack();

  if (
    materializedOpportunityId !== null
    && dependencies.postProcessOpportunity
  ) {
    try {
      await dependencies
        .postProcessOpportunity(
          materializedOpportunityId,
          env,
        );
    } catch {
      // Snapshot evidence is best-effort here.
      // Core opportunity queue success must remain independent.
    }
  }
}

export async function handleMainQueueBatch(
  batch: QueueBatchLike,
  env: RuntimeEnv,
  dependencies:
    QueueConsumerDependencies =
      defaultDependencies,
): Promise<void> {
  for (
    const message
    of batch.messages
  ) {
    await handleMainQueueMessage(
      message,
      env,
      dependencies,
    );
  }
}
