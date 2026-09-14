import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  dispatchEvent,
  type EventQueueMessageV1,
} from "../worker/queue-dispatch";

import type {
  RuntimeEnv,
} from "../worker/event-persistence";

const baseEnv = {
  APP_ENV: "dev",
  APP_NAME: "trading-company-hq",
  SUPABASE_URL:
    "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "test-key",
  EVENT_INGRESS_TOKEN:
    "test-token",
} as RuntimeEnv;

describe(
  "S03.2 queue dispatch contract",
  () => {
    it(
      "publishes only the minimum Queue Message V1 identity",
      async () => {
        const send = vi.fn(
          async (
            message:
              EventQueueMessageV1,
          ) => {
            void message;
          },
        );

        const env = {
          ...baseEnv,
          EVENT_QUEUE: {
            send,
          },
        };

        const eventId =
          crypto.randomUUID();

        await expect(
          dispatchEvent(
            eventId,
            "dev",
            env,
          ),
        ).resolves.toBe(true);

        expect(send)
          .toHaveBeenCalledTimes(1);

        expect(send)
          .toHaveBeenCalledWith({
            queue_contract_version: 1,
            event_id: eventId,
            environment: "dev",
          });

        expect(
          Object.keys(
            send.mock.calls[0][0],
          ).sort(),
        ).toEqual([
          "environment",
          "event_id",
          "queue_contract_version",
        ]);
      },
    );

    it(
      "returns false when EVENT_QUEUE is unavailable",
      async () => {
        await expect(
          dispatchEvent(
            crypto.randomUUID(),
            "dev",
            baseEnv,
          ),
        ).resolves.toBe(false);
      },
    );

    it(
      "returns false when queue publication throws",
      async () => {
        const env = {
          ...baseEnv,
          EVENT_QUEUE: {
            async send() {
              throw new Error(
                "queue unavailable",
              );
            },
          },
        };

        await expect(
          dispatchEvent(
            crypto.randomUUID(),
            "dev",
            env,
          ),
        ).resolves.toBe(false);
      },
    );
  },
);
