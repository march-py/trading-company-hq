import type { RuntimeEnv } from "./event-persistence";

import {
  listOpportunitySnapshots,
  readSnapshotImage,
} from "./opportunity-snapshot";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function parseOpportunitySnapshotListPath(pathname: string): string | null {
  const match = pathname.match(
    /^\/api\/opportunities\/([0-9a-f-]+)\/snapshots$/i,
  );
  if (match === null || !UUID_PATTERN.test(match[1] ?? "")) return null;
  return match[1] ?? null;
}

function parseSnapshotImagePath(pathname: string): string | null {
  const match = pathname.match(
    /^\/api\/opportunity-snapshots\/([0-9a-f-]+)\/image$/i,
  );
  if (match === null || !UUID_PATTERN.test(match[1] ?? "")) return null;
  return match[1] ?? null;
}

export function isOpportunitySnapshotApiRoute(pathname: string): boolean {
  return parseOpportunitySnapshotListPath(pathname) !== null
    || parseSnapshotImagePath(pathname) !== null;
}

export async function handleOpportunitySnapshotApi(
  request: Request,
  env: RuntimeEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(request.url);
  const opportunityId = parseOpportunitySnapshotListPath(url.pathname);
  if (opportunityId !== null) {
    const snapshots = await listOpportunitySnapshots(opportunityId, env);
    if (snapshots === null) {
      return jsonResponse({ error: "snapshot_store_unavailable" }, 503);
    }

    return jsonResponse({
      opportunity_id: opportunityId,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        capture_phase: snapshot.capture_phase,
        due_at: snapshot.due_at,
        status: snapshot.status,
        attempt_count: snapshot.attempt_count,
        captured_at: snapshot.captured_at,
        content_type: snapshot.content_type,
        width: snapshot.width,
        height: snapshot.height,
        renderer: snapshot.renderer,
        renderer_version: snapshot.renderer_version,
        last_error_code: snapshot.last_error_code,
        image_url: snapshot.status === "ready"
          ? `/api/opportunity-snapshots/${snapshot.id}/image`
          : null,
      })),
    });
  }

  const snapshotId = parseSnapshotImagePath(url.pathname);
  if (snapshotId !== null) {
    return readSnapshotImage(snapshotId, env);
  }

  return jsonResponse({ error: "not_found" }, 404);
}
