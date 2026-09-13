import { MAX_EVENT_BODY_BYTES, validateEventEnvelope } from "./event-envelope";
import { persistEvent, type PersistEvent, type RuntimeEnv } from "./event-persistence";

const encoder = new TextEncoder();

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function isAuthorized(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || typeof expectedToken !== "string" || expectedToken.length === 0) return false;
  const supplied = encoder.encode(authorization.slice(7));
  const expected = encoder.encode(expectedToken);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(first: BufferSource, second: BufferSource): boolean;
  };
  return supplied.byteLength === expected.byteLength && subtle.timingSafeEqual(supplied, expected);
}

function isJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > MAX_EVENT_BODY_BYTES) return null;
  }

  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_EVENT_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createEventIngressHandler(persist: PersistEvent = persistEvent) {
  return async function handleEventIngress(request: Request, env: RuntimeEnv): Promise<Response> {
    if (!isAuthorized(request, env.EVENT_INGRESS_TOKEN)) return errorResponse("unauthorized", 401);
    if (!isJson(request)) return errorResponse("unsupported_media_type", 415);

    const rawBody = await readBoundedBody(request);
    if (rawBody === null) return errorResponse("payload_too_large", 413);

    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return errorResponse("invalid_event", 400);
    }

    const validated = validateEventEnvelope(decoded);
    if (!validated.ok) return errorResponse("invalid_event", 400);

    const requestId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const stored = await persist({
      ...validated.value,
      id: eventId,
      environment: env.APP_ENV,
      request_id: requestId,
      correlation_id: validated.value.correlation_id ?? requestId,
      request_body_sha256: await sha256Hex(rawBody),
    }, env);

    if (!stored) return errorResponse("persistence_unavailable", 503);
    return Response.json({
      accepted: true,
      event_id: eventId,
      request_id: requestId,
      contract_version: 1,
    }, { status: 202, headers: { "cache-control": "no-store" } });
  };
}
