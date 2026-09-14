import type {
  EventEnvelopeV1,
} from "./event-envelope";

const MACHINE_ID_PATTERN =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const MAX_STRATEGY_PAYLOAD_BYTES =
  32_768;

const MAX_PAYLOAD_DEPTH = 8;

const FUTURE_TOLERANCE_MS =
  5 * 60 * 1000;

const REQUIRED_FIELDS =
  [
    "contract_version",
    "source",
    "signal_type",
    "strategy_id",
    "strategy_version",
    "exchange",
    "ticker",
    "interval",
    "bar_time",
    "triggered_at",
    "payload",
  ] as const;

const OPTIONAL_FIELDS =
  [
    "direction",
    "price",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "alert_name",
    "setup_key",
  ] as const;

const ALLOWED_FIELDS =
  new Set<string>([
    ...REQUIRED_FIELDS,
    ...OPTIONAL_FIELDS,
  ]);

export interface TradingViewWebhookV1 {
  contract_version: 1;
  source: "tradingview";
  signal_type: string;
  strategy_id: string;
  strategy_version: number;
  exchange: string;
  ticker: string;
  interval: string;
  bar_time: string;
  triggered_at: string;
  payload: Record<string, unknown>;
  direction?:
    | "long"
    | "short"
    | "neutral";
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  alert_name?: string;
  setup_key?: string;
}

export type TradingViewPayloadValidation =
  | {
      ok: true;
      value: TradingViewWebhookV1;
      envelope: EventEnvelopeV1;
    }
  | {
      ok: false;
      reason:
        | "invalid"
        | "unsupported_contract";
    };

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isMachineId(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && MACHINE_ID_PATTERN.test(value)
  );
}

function isCleanProviderString(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value === value.trim()
    && !Array.from(value).some(
      (character) => {
        const code =
          character.charCodeAt(0);

        return (
          code <= 0x1f
          || code === 0x7f
        );
      },
    )
  );
}

function normalizeUtcInstant(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
    || !UTC_INSTANT_PATTERN.test(value)
  ) {
    return null;
  }

  const parsed =
    Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed)
    .toISOString();
}

function isFiniteOptionalNumber(
  value: unknown,
): boolean {
  return (
    value === undefined
    || (
      typeof value === "number"
      && Number.isFinite(value)
    )
  );
}

function payloadDepth(
  value: unknown,
  depth = 0,
): number {
  if (
    value === null
    || typeof value !== "object"
  ) {
    return depth;
  }

  if (depth > MAX_PAYLOAD_DEPTH) {
    return depth;
  }

  const children =
    Array.isArray(value)
      ? value
      : Object.values(value);

  let maximum = depth;

  for (const child of children) {
    maximum = Math.max(
      maximum,
      payloadDepth(
        child,
        depth + 1,
      ),
    );
  }

  return maximum;
}

function isBoundedPayload(
  value: unknown,
): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }

  if (
    payloadDepth(value)
    > MAX_PAYLOAD_DEPTH
  ) {
    return false;
  }

  try {
    return (
      new TextEncoder()
        .encode(
          JSON.stringify(value),
        )
        .byteLength
      <= MAX_STRATEGY_PAYLOAD_BYTES
    );
  } catch {
    return false;
  }
}

export const tradingViewPayloadContract = {
  requiredFields: REQUIRED_FIELDS,
  optionalFields: OPTIONAL_FIELDS,
  allowedFields: ALLOWED_FIELDS,
  futureToleranceMs:
    FUTURE_TOLERANCE_MS,
};

function copyOptionalFields(
  input: TradingViewWebhookV1,
): Record<string, unknown> {
  const result:
    Record<string, unknown> = {};

  if (
    input.direction !== undefined
  ) {
    result.direction =
      input.direction;
  }

  for (
    const key
    of [
      "price",
      "open",
      "high",
      "low",
      "close",
      "volume",
    ] as const
  ) {
    if (
      input[key] !== undefined
    ) {
      result[key] =
        input[key];
    }
  }

  if (
    input.alert_name !== undefined
  ) {
    result.alert_name =
      input.alert_name;
  }

  if (
    input.setup_key !== undefined
  ) {
    result.setup_key =
      input.setup_key;
  }

  return result;
}

export function validateTradingViewPayload(
  value: unknown,
  nowMs = Date.now(),
): TradingViewPayloadValidation {
  if (!isObject(value)) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    Object.keys(value)
      .some(
        (key) =>
          !ALLOWED_FIELDS.has(key),
      )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  for (
    const key
    of REQUIRED_FIELDS
  ) {
    if (!(key in value)) {
      return {
        ok: false,
        reason: "invalid",
      };
    }
  }

  if (
    value.contract_version !== 1
  ) {
    return {
      ok: false,
      reason:
        "unsupported_contract",
    };
  }

  if (
    value.source !== "tradingview"
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    !isMachineId(
      value.signal_type,
      64,
    )
    || !isMachineId(
      value.strategy_id,
      64,
    )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    !Number.isInteger(
      value.strategy_version,
    )
    || (
      value.strategy_version as number
    ) <= 0
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    !isCleanProviderString(
      value.exchange,
      64,
    )
    || !isCleanProviderString(
      value.ticker,
      128,
    )
    || !isCleanProviderString(
      value.interval,
      32,
    )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  const barTime =
    normalizeUtcInstant(
      value.bar_time,
    );

  const triggeredAt =
    normalizeUtcInstant(
      value.triggered_at,
    );

  if (
    barTime === null
    || triggeredAt === null
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    Date.parse(triggeredAt)
    > nowMs
      + FUTURE_TOLERANCE_MS
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    value.direction !== undefined
    && value.direction !== "long"
    && value.direction !== "short"
    && value.direction !== "neutral"
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  for (
    const key
    of [
      "price",
      "open",
      "high",
      "low",
      "close",
      "volume",
    ] as const
  ) {
    if (
      !isFiniteOptionalNumber(
        value[key],
      )
    ) {
      return {
        ok: false,
        reason: "invalid",
      };
    }
  }

  if (
    value.alert_name !== undefined
    && !isCleanProviderString(
      value.alert_name,
      128,
    )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    value.setup_key !== undefined
    && !isMachineId(
      value.setup_key,
      128,
    )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (
    !isBoundedPayload(
      value.payload,
    )
  ) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  const normalized:
    TradingViewWebhookV1 = {
      contract_version: 1,
      source:
        "tradingview",
      signal_type:
        value.signal_type,
      strategy_id:
        value.strategy_id,
      strategy_version:
        value.strategy_version as number,
      exchange:
        value.exchange,
      ticker:
        value.ticker,
      interval:
        value.interval,
      bar_time:
        barTime,
      triggered_at:
        triggeredAt,
      payload:
        value.payload,
    };

  if (
    value.direction !== undefined
  ) {
    normalized.direction =
      value.direction;
  }

  for (
    const key
    of [
      "price",
      "open",
      "high",
      "low",
      "close",
      "volume",
    ] as const
  ) {
    if (
      value[key] !== undefined
    ) {
      normalized[key] =
        value[key] as number;
    }
  }

  if (
    value.alert_name !== undefined
  ) {
    normalized.alert_name =
      value.alert_name;
  }

  if (
    value.setup_key !== undefined
  ) {
    normalized.setup_key =
      value.setup_key;
  }

  const envelope:
    EventEnvelopeV1 = {
      contract_version: 1,
      event_type:
        "tradingview.signal",
      event_version: 1,
      occurred_at:
        triggeredAt,
      source_id: null,
      provenance_record_id:
        null,
      external_event_id: null,
      subject_type: null,
      subject_id: null,
      correlation_id: null,
      causation_event_id: null,
      payload: {
        signal_type:
          normalized.signal_type,
        strategy_id:
          normalized.strategy_id,
        strategy_version:
          normalized.strategy_version,
        exchange:
          normalized.exchange,
        ticker:
          normalized.ticker,
        interval:
          normalized.interval,
        bar_time:
          normalized.bar_time,
        triggered_at:
          normalized.triggered_at,
        ...copyOptionalFields(
          normalized,
        ),
        payload:
          normalized.payload,
      },
    };

  return {
    ok: true,
    value: normalized,
    envelope,
  };
}
