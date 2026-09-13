import { createEventIngressHandler } from "./event-ingress";
import type { RuntimeEnv } from "./event-persistence";

const handleEventIngress = createEventIngressHandler();

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json(
        { status: "ok", app: env.APP_NAME, environment: env.APP_ENV, time: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (request.method === "POST" && url.pathname === "/api/events/ingest") {
      return handleEventIngress(request, env);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<RuntimeEnv>;
