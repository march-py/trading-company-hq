export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function validateIdempotencyKey(value: string | null): string | null {
  if (value === null || !IDEMPOTENCY_KEY_PATTERN.test(value)) return null;
  return value;
}

export async function hashIdempotencyKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
