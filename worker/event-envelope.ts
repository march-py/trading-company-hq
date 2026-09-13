export const MAX_EVENT_BODY_BYTES = 65_536;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SUBJECT_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/;
const OFFSET_INSTANT_PATTERN = /(Z|[+-]\d{2}:\d{2})$/;

const CLIENT_FIELDS = new Set([
  "contract_version",
  "event_type",
  "event_version",
  "occurred_at",
  "source_id",
  "provenance_record_id",
  "external_event_id",
  "subject_type",
  "subject_id",
  "correlation_id",
  "causation_event_id",
  "payload",
]);

export interface EventEnvelopeV1 {
  contract_version: 1;
  event_type: string;
  event_version: number;
  occurred_at: string | null;
  source_id: string | null;
  provenance_record_id: string | null;
  external_event_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  correlation_id: string | null;
  causation_event_id: string | null;
  payload: Record<string, unknown>;
}

export type EnvelopeValidation =
  | { ok: true; value: EventEnvelopeV1 }
  | { ok: false };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maximum?: number): value is string | undefined {
  return value === undefined || (
    typeof value === "string"
    && value.length > 0
    && (maximum === undefined || value.length <= maximum)
  );
}

function optionalUuid(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && UUID_PATTERN.test(value));
}

export function validateEventEnvelope(value: unknown): EnvelopeValidation {
  if (!isObject(value) || Object.keys(value).some((key) => !CLIENT_FIELDS.has(key))) return { ok: false };
  if (value.contract_version !== 1) return { ok: false };
  if (typeof value.event_type !== "string" || value.event_type.length > 128 || !EVENT_TYPE_PATTERN.test(value.event_type)) return { ok: false };
  if (!Number.isInteger(value.event_version) || (value.event_version as number) <= 0) return { ok: false };
  if (!isObject(value.payload)) return { ok: false };

  if (!optionalUuid(value.source_id) || !optionalUuid(value.provenance_record_id)) return { ok: false };
  if (value.provenance_record_id !== undefined && value.source_id === undefined) return { ok: false };
  if (!optionalString(value.external_event_id, 256)) return { ok: false };
  if (!optionalString(value.subject_type, 64) || (value.subject_type !== undefined && !SUBJECT_TYPE_PATTERN.test(value.subject_type))) return { ok: false };
  if (!optionalUuid(value.subject_id) || ((value.subject_type === undefined) !== (value.subject_id === undefined))) return { ok: false };
  if (!optionalUuid(value.correlation_id) || !optionalUuid(value.causation_event_id)) return { ok: false };

  let occurredAt: string | null = null;
  if (value.occurred_at !== undefined) {
    if (typeof value.occurred_at !== "string" || !OFFSET_INSTANT_PATTERN.test(value.occurred_at)) return { ok: false };
    const timestamp = Date.parse(value.occurred_at);
    if (!Number.isFinite(timestamp)) return { ok: false };
    occurredAt = new Date(timestamp).toISOString();
  }

  return {
    ok: true,
    value: {
      contract_version: 1,
      event_type: value.event_type,
      event_version: value.event_version as number,
      occurred_at: occurredAt,
      source_id: (value.source_id as string | undefined) ?? null,
      provenance_record_id: (value.provenance_record_id as string | undefined) ?? null,
      external_event_id: (value.external_event_id as string | undefined) ?? null,
      subject_type: (value.subject_type as string | undefined) ?? null,
      subject_id: (value.subject_id as string | undefined) ?? null,
      correlation_id: (value.correlation_id as string | undefined) ?? null,
      causation_event_id: (value.causation_event_id as string | undefined) ?? null,
      payload: value.payload,
    },
  };
}
