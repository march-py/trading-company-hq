import type { RuntimeEnv } from "./event-persistence";

export type SnapshotPhase =
  | "trigger"
  | "plus_4h"
  | "plus_12h"
  | "plus_24h"
  | "final";

export type SnapshotStatus =
  | "pending"
  | "capturing"
  | "ready"
  | "failed"
  | "waiting_final";

interface OpportunitySnapshotSource {
  id: string;
  environment: RuntimeEnv["APP_ENV"];
  exchange: string;
  ticker: string;
  interval: string;
  triggered_at: string;
  strategy_id: string;
  strategy_version: number;
  direction: "long" | "short" | "neutral" | null;
}

export interface OpportunitySnapshotRow {
  id: string;
  opportunity_id: string;
  environment: RuntimeEnv["APP_ENV"];
  capture_phase: SnapshotPhase;
  due_at: string | null;
  status: SnapshotStatus;
  attempt_count: number;
  captured_at: string | null;
  object_key: string | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
  renderer: string;
  renderer_version: number;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

const SNAPSHOT_WIDTH = 1600;
const SNAPSHOT_HEIGHT = 900;
const MAX_ATTEMPTS = 5;
const SNAPSHOT_RENDERER = "cloudflare_browser_run";
const SNAPSHOT_RENDERER_VERSION = 1;

function runtimeHeaders(
  env: RuntimeEnv,
): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function phaseDueAt(
  triggeredAt: string,
  phase: Exclude<SnapshotPhase, "final">,
): string {
  const base = new Date(triggeredAt).getTime();
  const offset = phase === "trigger"
    ? 0
    : phase === "plus_4h"
      ? 4 * 60 * 60 * 1000
      : phase === "plus_12h"
        ? 12 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

  return new Date(base + offset).toISOString();
}

function buildSnapshotHtml(
  opportunity: OpportunitySnapshotSource,
  phase: SnapshotPhase,
): string {
  const symbol = `${opportunity.exchange}:${opportunity.ticker}`;
  const direction = opportunity.direction ?? "neutral";
  const widgetConfig = {
    autosize: true,
    symbol,
    interval: opportunity.interval,
    timezone: "Etc/UTC",
    theme: "light",
    style: "1",
    locale: "en",
    allow_symbol_change: false,
    save_image: false,
    hide_top_toolbar: false,
    hide_legend: false,
    withdateranges: true,
    calendar: false,
    support_host: "https://www.tradingview.com",
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; background: #f4f1e8; color: #24312d; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .frame { width: ${SNAPSHOT_WIDTH}px; height: ${SNAPSHOT_HEIGHT}px; padding: 22px; display: grid; grid-template-rows: 78px 1fr; gap: 14px; background: linear-gradient(145deg,#faf7ef 0%,#eef2ec 100%); }
  .header { display: flex; align-items: center; justify-content: space-between; border: 1px solid #cfd6ca; border-radius: 18px; background: rgba(255,255,255,.78); padding: 14px 20px; }
  .eyebrow { font-size: 12px; letter-spacing: .15em; text-transform: uppercase; color: #718079; font-weight: 700; }
  .title { margin-top: 4px; font-size: 28px; font-weight: 750; letter-spacing: -.03em; }
  .meta { text-align: right; font-size: 13px; color: #627069; line-height: 1.5; }
  .direction { color: ${direction === "short" ? "#9d4935" : direction === "long" ? "#2b7155" : "#6f766f"}; font-weight: 750; text-transform: uppercase; }
  .chart-shell { overflow: hidden; border: 1px solid #cfd6ca; border-radius: 18px; background: #fff; }
  .tradingview-widget-container, .tradingview-widget-container__widget { width: 100%; height: 100%; }
</style>
</head>
<body>
<div class="frame">
  <div class="header">
    <div>
      <div class="eyebrow">Trading Company · Setup Camera · ${escapeHtml(phase)}</div>
      <div class="title">${escapeHtml(symbol)} · ${escapeHtml(opportunity.interval)}</div>
    </div>
    <div class="meta">
      <div><span class="direction">${escapeHtml(direction)}</span> · ${escapeHtml(opportunity.strategy_id)} v${opportunity.strategy_version}</div>
      <div>Trigger ${escapeHtml(opportunity.triggered_at)} · UTC</div>
      <div>Opportunity ${escapeHtml(opportunity.id)}</div>
    </div>
  </div>
  <div class="chart-shell">
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  </div>
</div>
<script src="https://s3.tradingview.com/tv.js"></script>
<script>
  const config = ${escapeScriptJson(widgetConfig)};
  if (window.TradingView && window.TradingView.widget) {
    new window.TradingView.widget({ ...config, container_id: document.querySelector('.tradingview-widget-container__widget') });
  }
</script>
</body>
</html>`;
}

async function readOpportunity(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<OpportunitySnapshotSource | null> {
  const endpoint = new URL("/rest/v1/opportunities", env.SUPABASE_URL);
  endpoint.searchParams.set(
    "select",
    "id,environment,exchange,ticker,interval,triggered_at,strategy_id,strategy_version,direction",
  );
  endpoint.searchParams.set("id", `eq.${opportunityId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: runtimeHeaders(env),
    });

    if (response.status !== 200) return null;
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded) || decoded.length !== 1 || !isObject(decoded[0])) return null;
    const row = decoded[0];

    if (
      !isUuid(row.id)
      || (row.environment !== "dev" && row.environment !== "prod")
      || typeof row.exchange !== "string"
      || typeof row.ticker !== "string"
      || typeof row.interval !== "string"
      || typeof row.triggered_at !== "string"
      || typeof row.strategy_id !== "string"
      || !Number.isInteger(row.strategy_version)
      || (row.direction !== null && row.direction !== "long" && row.direction !== "short" && row.direction !== "neutral")
    ) return null;

    return row as unknown as OpportunitySnapshotSource;
  } catch {
    return null;
  }
}

export async function ensureOpportunitySnapshotSchedule(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<boolean> {
  const opportunity = await readOpportunity(opportunityId, env);
  if (opportunity === null) return false;

  const rows = [
    {
      opportunity_id: opportunity.id,
      environment: env.APP_ENV,
      capture_phase: "trigger",
      due_at: phaseDueAt(opportunity.triggered_at, "trigger"),
      status: "pending",
      renderer: SNAPSHOT_RENDERER,
      renderer_version: SNAPSHOT_RENDERER_VERSION,
    },
    {
      opportunity_id: opportunity.id,
      environment: env.APP_ENV,
      capture_phase: "plus_4h",
      due_at: phaseDueAt(opportunity.triggered_at, "plus_4h"),
      status: "pending",
      renderer: SNAPSHOT_RENDERER,
      renderer_version: SNAPSHOT_RENDERER_VERSION,
    },
    {
      opportunity_id: opportunity.id,
      environment: env.APP_ENV,
      capture_phase: "plus_12h",
      due_at: phaseDueAt(opportunity.triggered_at, "plus_12h"),
      status: "pending",
      renderer: SNAPSHOT_RENDERER,
      renderer_version: SNAPSHOT_RENDERER_VERSION,
    },
    {
      opportunity_id: opportunity.id,
      environment: env.APP_ENV,
      capture_phase: "plus_24h",
      due_at: phaseDueAt(opportunity.triggered_at, "plus_24h"),
      status: "pending",
      renderer: SNAPSHOT_RENDERER,
      renderer_version: SNAPSHOT_RENDERER_VERSION,
    },
    {
      opportunity_id: opportunity.id,
      environment: env.APP_ENV,
      capture_phase: "final",
      due_at: null,
      status: "waiting_final",
      renderer: SNAPSHOT_RENDERER,
      renderer_version: SNAPSHOT_RENDERER_VERSION,
    },
  ];

  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("on_conflict", "opportunity_id,capture_phase");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...runtimeHeaders(env),
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    return response.status === 201;
  } catch {
    return false;
  }
}

async function readSnapshot(
  snapshotId: string,
  env: RuntimeEnv,
): Promise<OpportunitySnapshotRow | null> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("id", `eq.${snapshotId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, { headers: runtimeHeaders(env) });
    if (response.status !== 200) return null;
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded) || decoded.length !== 1 || !isObject(decoded[0])) return null;
    return decoded[0] as unknown as OpportunitySnapshotRow;
  } catch {
    return null;
  }
}

async function claimSnapshot(
  snapshot: OpportunitySnapshotRow,
  env: RuntimeEnv,
): Promise<boolean> {
  if (snapshot.status !== "pending" && snapshot.status !== "failed") return false;
  if (snapshot.attempt_count >= MAX_ATTEMPTS) return false;

  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("id", `eq.${snapshot.id}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("status", `eq.${snapshot.status}`);
  endpoint.searchParams.set("select", "id");

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...runtimeHeaders(env),
        prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "capturing",
        attempt_count: snapshot.attempt_count + 1,
        last_error_code: null,
      }),
    });
    if (response.status !== 200) return false;
    const decoded: unknown = await response.json();
    return Array.isArray(decoded) && decoded.length === 1;
  } catch {
    return false;
  }
}

async function markSnapshotFailed(
  snapshotId: string,
  errorCode: string,
  env: RuntimeEnv,
): Promise<void> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("id", `eq.${snapshotId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);

  try {
    await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...runtimeHeaders(env),
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "failed",
        last_error_code: errorCode,
      }),
    });
  } catch {
    // Best-effort error persistence. The core opportunity pipeline must remain independent.
  }
}

export async function captureOpportunitySnapshot(
  snapshotId: string,
  env: RuntimeEnv,
): Promise<boolean> {
  const snapshot = await readSnapshot(snapshotId, env);
  if (snapshot === null) return false;
  if (snapshot.status === "ready") return true;
  if (snapshot.status === "waiting_final") return false;

  const claimed = await claimSnapshot(snapshot, env);
  if (!claimed) return false;

  const opportunity = await readOpportunity(snapshot.opportunity_id, env);
  if (opportunity === null) {
    await markSnapshotFailed(snapshot.id, "opportunity_unavailable", env);
    return false;
  }

  let renderResponse: Response;
  try {
    renderResponse = await env.BROWSER.quickAction("screenshot", {
      html: buildSnapshotHtml(opportunity, snapshot.capture_phase),
      viewport: {
        width: SNAPSHOT_WIDTH,
        height: SNAPSHOT_HEIGHT,
        deviceScaleFactor: 1,
      },
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 45_000,
      },
      waitForTimeout: 4_000,
      screenshotOptions: {
        type: "png",
        fullPage: false,
      },
    });
  } catch {
    await markSnapshotFailed(snapshot.id, "browser_render_failed", env);
    return false;
  }

  if (!renderResponse.ok) {
    await markSnapshotFailed(snapshot.id, "browser_render_failed", env);
    return false;
  }

  let imageBytes: ArrayBuffer;
  try {
    imageBytes = await renderResponse.arrayBuffer();
  } catch {
    await markSnapshotFailed(snapshot.id, "browser_response_invalid", env);
    return false;
  }

  if (imageBytes.byteLength < 1_000) {
    await markSnapshotFailed(snapshot.id, "browser_response_invalid", env);
    return false;
  }

  const objectKey = [
    env.APP_ENV,
    "opportunities",
    opportunity.id,
    `${snapshot.capture_phase}-${snapshot.id}.png`,
  ].join("/");

  try {
    await env.SNAPSHOT_BUCKET.put(objectKey, imageBytes, {
      httpMetadata: {
        contentType: "image/png",
      },
      customMetadata: {
        opportunity_id: opportunity.id,
        snapshot_id: snapshot.id,
        capture_phase: snapshot.capture_phase,
        exchange: opportunity.exchange,
        ticker: opportunity.ticker,
        interval: opportunity.interval,
        renderer: SNAPSHOT_RENDERER,
        renderer_version: String(SNAPSHOT_RENDERER_VERSION),
      },
    });
  } catch {
    await markSnapshotFailed(snapshot.id, "r2_write_failed", env);
    return false;
  }

  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("id", `eq.${snapshot.id}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("status", "eq.capturing");

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...runtimeHeaders(env),
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "ready",
        captured_at: new Date().toISOString(),
        object_key: objectKey,
        content_type: "image/png",
        width: SNAPSHOT_WIDTH,
        height: SNAPSHOT_HEIGHT,
        last_error_code: null,
      }),
    });

    return response.status === 204;
  } catch {
    return false;
  }
}

export async function captureTriggerSnapshotForOpportunity(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<boolean> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("opportunity_id", `eq.${opportunityId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("capture_phase", "eq.trigger");
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, { headers: runtimeHeaders(env) });
    if (response.status !== 200) return false;
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded) || decoded.length !== 1 || !isObject(decoded[0]) || !isUuid(decoded[0].id)) return false;
    return captureOpportunitySnapshot(decoded[0].id, env);
  } catch {
    return false;
  }
}

export async function processDueOpportunitySnapshots(
  env: RuntimeEnv,
  limit = 4,
): Promise<{ attempted: number; succeeded: number }> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("status", "in.(pending,failed)");
  endpoint.searchParams.set("due_at", `lte.${new Date().toISOString()}`);
  endpoint.searchParams.set("attempt_count", `lt.${MAX_ATTEMPTS}`);
  endpoint.searchParams.set("order", "due_at.asc");
  endpoint.searchParams.set("limit", String(Math.max(1, Math.min(limit, 10))));

  let snapshots: OpportunitySnapshotRow[];
  try {
    const response = await fetch(endpoint, { headers: runtimeHeaders(env) });
    if (response.status !== 200) return { attempted: 0, succeeded: 0 };
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded)) return { attempted: 0, succeeded: 0 };
    snapshots = decoded.filter(isObject) as unknown as OpportunitySnapshotRow[];
  } catch {
    return { attempted: 0, succeeded: 0 };
  }

  let succeeded = 0;
  for (const snapshot of snapshots) {
    if (await captureOpportunitySnapshot(snapshot.id, env)) succeeded += 1;
  }

  return { attempted: snapshots.length, succeeded };
}

export async function reconcileRecentOpportunitySnapshotSchedules(
  env: RuntimeEnv,
  lookbackHours = 48,
): Promise<number> {
  const endpoint = new URL("/rest/v1/opportunities", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set(
    "created_at",
    `gte.${new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()}`,
  );
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "100");

  try {
    const response = await fetch(endpoint, { headers: runtimeHeaders(env) });
    if (response.status !== 200) return 0;
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded)) return 0;

    let repaired = 0;
    for (const row of decoded) {
      if (isObject(row) && isUuid(row.id)) {
        if (await ensureOpportunitySnapshotSchedule(row.id, env)) repaired += 1;
      }
    }
    return repaired;
  } catch {
    return 0;
  }
}

export async function armFinalOpportunitySnapshot(
  opportunityId: string,
  dueAt: string,
  env: RuntimeEnv,
): Promise<boolean> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set("opportunity_id", `eq.${opportunityId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("capture_phase", "eq.final");
  endpoint.searchParams.set("status", "eq.waiting_final");

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...runtimeHeaders(env),
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "pending",
        due_at: dueAt,
      }),
    });
    return response.status === 204;
  } catch {
    return false;
  }
}

export async function listOpportunitySnapshots(
  opportunityId: string,
  env: RuntimeEnv,
): Promise<OpportunitySnapshotRow[] | null> {
  const endpoint = new URL("/rest/v1/opportunity_snapshots", env.SUPABASE_URL);
  endpoint.searchParams.set(
    "select",
    "id,opportunity_id,environment,capture_phase,due_at,status,attempt_count,captured_at,object_key,content_type,width,height,renderer,renderer_version,last_error_code,created_at,updated_at",
  );
  endpoint.searchParams.set("opportunity_id", `eq.${opportunityId}`);
  endpoint.searchParams.set("environment", `eq.${env.APP_ENV}`);
  endpoint.searchParams.set("order", "created_at.asc");

  try {
    const response = await fetch(endpoint, { headers: runtimeHeaders(env) });
    if (response.status !== 200) return null;
    const decoded: unknown = await response.json();
    if (!Array.isArray(decoded)) return null;
    return decoded.filter(isObject) as unknown as OpportunitySnapshotRow[];
  } catch {
    return null;
  }
}

export async function readSnapshotImage(
  snapshotId: string,
  env: RuntimeEnv,
): Promise<Response> {
  const snapshot = await readSnapshot(snapshotId, env);
  if (snapshot === null || snapshot.status !== "ready" || snapshot.object_key === null) {
    return Response.json({ error: "snapshot_not_found" }, { status: 404 });
  }

  const object = await env.SNAPSHOT_BUCKET.get(snapshot.object_key);
  if (object === null) {
    return Response.json({ error: "snapshot_asset_missing" }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=300");
  headers.set("etag", object.httpEtag);

  return new Response(object.body, { headers });
}
