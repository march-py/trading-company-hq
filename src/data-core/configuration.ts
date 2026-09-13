export const APP_ENVIRONMENTS = ["dev", "prod"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const FEATURE_FLAG_STATES = ["disabled", "shadow", "enabled"] as const;
export type FeatureFlagState = (typeof FEATURE_FLAG_STATES)[number];

export interface EnvironmentRecord {
  environment: string;
}

export interface FeatureFlagRecord extends EnvironmentRecord {
  key: string;
  state: string;
}

export function requireAppEnvironment(value: string): AppEnvironment {
  if (value === "dev" || value === "prod") return value;
  throw new Error("APP_ENV must be exactly dev or prod");
}

export function selectEnvironmentRecords<T extends EnvironmentRecord>(
  records: readonly T[],
  environment: AppEnvironment,
): T[] {
  return records.filter((record) => record.environment === environment);
}

export function resolveFeatureFlag(
  records: readonly FeatureFlagRecord[],
  environment: AppEnvironment,
  key: string,
): FeatureFlagState {
  const match = records.find(
    (record) => record.environment === environment && record.key.toLowerCase() === key.toLowerCase(),
  );

  return match && FEATURE_FLAG_STATES.includes(match.state as FeatureFlagState)
    ? match.state as FeatureFlagState
    : "disabled";
}
