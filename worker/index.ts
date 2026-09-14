import {
  createEventIngressHandler,
} from "./event-ingress";

import type {
  RuntimeEnv,
} from "./event-persistence";

import {
  handleMainQueueBatch,
} from "./queue-consumer";

import {
  handleDeadLetterBatch,
} from "./dead-letter";

const handleEventIngress =
  createEventIngressHandler();

function mainQueueName(
  environment:
    RuntimeEnv["APP_ENV"],
): string {
  return environment === "dev"
    ? "trading-company-events-dev"
    : "trading-company-events-prod";
}

function deadLetterQueueName(
  environment:
    RuntimeEnv["APP_ENV"],
): string {
  return environment === "dev"
    ? "trading-company-events-dlq-dev"
    : "trading-company-events-dlq-prod";
}

export default {
  async fetch(
    request,
    env,
  ): Promise<Response> {
    const url =
      new URL(request.url);

    if (
      request.method === "GET"
      && url.pathname
        === "/api/health"
    ) {
      return Response.json(
        {
          status: "ok",
          app:
            env.APP_NAME,
          environment:
            env.APP_ENV,
          time:
            new Date()
              .toISOString(),
        },
        {
          headers: {
            "cache-control":
              "no-store",
          },
        },
      );
    }

    if (
      request.method === "POST"
      && url.pathname
        === "/api/events/ingest"
    ) {
      return handleEventIngress(
        request,
        env,
      );
    }

    return Response.json(
      {
        error: "not_found",
      },
      {
        status: 404,
      },
    );
  },

  async queue(
    batch,
    env,
  ): Promise<void> {
    const mainQueue =
      mainQueueName(
        env.APP_ENV,
      );

    const deadLetterQueue =
      deadLetterQueueName(
        env.APP_ENV,
      );

    if (
      batch.queue
      === mainQueue
    ) {
      await handleMainQueueBatch(
        batch,
        env,
      );

      return;
    }

    if (
      batch.queue
      === deadLetterQueue
    ) {
      await handleDeadLetterBatch(
        batch,
        env,
      );

      return;
    }

    for (
      const message
      of batch.messages
    ) {
      message.retry({
        delaySeconds: 30,
      });
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
