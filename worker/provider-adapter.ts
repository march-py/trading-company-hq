import type {
  AppEnvironment,
} from "./event-persistence";

export interface ProviderAdapterContext {
  environment: AppEnvironment;
  scheduledFor: string;
  runId: string;
}

export type ProviderHealthResult =
  | {
      ok: true;
      status: "healthy";
    }
  | {
      ok: false;
      status: "degraded" | "failed";
      failure_code: string;
    };

export type ProviderExecutionResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      failure_code: string;
    };

export interface ProviderAdapter<I, O> {
  readonly key: string;
  readonly version: number;

  healthCheck(
    context: ProviderAdapterContext,
  ): Promise<ProviderHealthResult>;

  execute(
    input: I,
    context: ProviderAdapterContext,
  ): Promise<ProviderExecutionResult<O>>;
}

export function isBoundedJson(
  value: unknown,
  maxBytes: number,
): boolean {
  try {
    return (
      new TextEncoder()
        .encode(JSON.stringify(value))
        .byteLength
      <= maxBytes
    );
  } catch {
    return false;
  }
}
