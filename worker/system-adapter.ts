import type {
  ProviderAdapter,
} from "./provider-adapter";

export interface SystemHeartbeatInput {
  jobKey: "system_heartbeat";
}

export interface SystemHeartbeatOutput {
  component: "scheduler";
  source: "cloudflare_cron";
  status: "healthy";
}

export const systemAdapter:
  ProviderAdapter<
    SystemHeartbeatInput,
    SystemHeartbeatOutput
  > = {
    key: "system_internal",
    version: 1,

    async healthCheck() {
      return {
        ok: true,
        status: "healthy",
      };
    },

    async execute(input) {
      if (
        input.jobKey
        !== "system_heartbeat"
      ) {
        return {
          ok: false,
          failure_code:
            "unsupported_system_job",
        };
      }

      return {
        ok: true,
        value: {
          component: "scheduler",
          source: "cloudflare_cron",
          status: "healthy",
        },
      };
    },
  };
