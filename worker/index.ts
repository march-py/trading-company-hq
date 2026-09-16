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

import {
  handleScheduledEvent,
} from "./scheduled-runner";

import {
  readAutomationHealth,
} from "./automation-health";

import {
  createTradingViewWebhookHandler,
} from "./tradingview-webhook";

import {
  isTradingViewWebhookRouteCandidate,
} from "./tradingview-auth";

import {
  createOpportunityApiHandler,
} from "./opportunity-api";

import {
  handleOpportunitySnapshotApi,
  isOpportunitySnapshotApiRoute,
} from "./opportunity-snapshot-api";

import {
  processDueOpportunitySnapshots,
  reconcileRecentOpportunitySnapshotSchedules,
} from "./opportunity-snapshot";

const handleEventIngress =
  createEventIngressHandler();

const handleTradingViewWebhook =
  createTradingViewWebhookHandler();

const handleOpportunityApi =
  createOpportunityApiHandler();

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

async function runSnapshotMaintenance(
  env: RuntimeEnv,
): Promise<void> {
  await reconcileRecentOpportunitySnapshotSchedules(
    env,
  );

  await processDueOpportunitySnapshots(
    env,
  );
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
      request.method === "GET"
      && url.pathname
        === "/api/health/automation"
    ) {
      const health =
        await readAutomationHealth(
          env,
        );

      return Response.json(
        health,
        {
          headers: {
            "cache-control":
              "no-store",
          },
        },
      );
    }

    if (
      isOpportunitySnapshotApiRoute(
        url.pathname,
      )
    ) {
      return handleOpportunitySnapshotApi(
        request,
        env,
      );
    }

    if (
      url.pathname
        === "/api/opportunities"
      || url.pathname.startsWith(
        "/api/opportunities/",
      )
    ) {
      return handleOpportunityApi(
        request,
        env,
      );
    }

    if (
      isTradingViewWebhookRouteCandidate(
        url.pathname,
      )
    ) {
      return handleTradingViewWebhook(
        request,
        env,
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

      await runSnapshotMaintenance(
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

  async scheduled(
    controller,
    env,
  ): Promise<void> {
    await handleScheduledEvent(
      {
        cron:
          controller.cron,
        scheduledTime:
          controller.scheduledTime,
      },
      env,
    );

    await runSnapshotMaintenance(
      env,
    );
  },
} satisfies ExportedHandler<RuntimeEnv>;
