export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json(
        { status: "ok", app: env.APP_NAME, environment: env.APP_ENV, time: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
