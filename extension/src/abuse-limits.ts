/** Persisted per API key fingerprint; never put API keys in history or quota metadata. */
export interface AbuseLimits {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  updatedAt?: number;
  nextRequestAt?: number;
  blockedUntil?: number;
  reason?: "quota" | "rate-limit";
  estimated?: boolean;
}
export async function abuseKeyId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key.trim()),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function headerNumber(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
export function retryAt(headers: Headers, now: number) {
  const raw = headers.get("retry-after");
  if (!raw?.trim()) return undefined;
  const seconds = headerNumber(headers, "retry-after");
  const value = seconds == null ? Date.parse(raw) : now + seconds * 1000;
  return Number.isFinite(value) && value > now ? value : undefined;
}
export function updateAbuseLimits(
  previous: AbuseLimits,
  response: Response,
  now = Date.now(),
): AbuseLimits {
  const limit = headerNumber(response.headers, "x-ratelimit-limit");
  const remaining = headerNumber(response.headers, "x-ratelimit-remaining");
  const reset = headerNumber(response.headers, "x-ratelimit-reset");
  const next = { ...previous };
  if (limit != null) next.limit = limit;
  if (remaining != null) next.remaining = remaining;
  if (reset != null) next.resetAt = reset * 1000;
  if (limit != null || remaining != null || reset != null) next.updatedAt = now;
  if (response.status === 429 || remaining === 0) {
    const retry = retryAt(response.headers, now);
    const resetAt =
      remaining === 0 && (next.resetAt ?? 0) > now ? next.resetAt : undefined;
    next.blockedUntil = Math.max(retry ?? 0, resetAt ?? 0) || now + 60_000;
    next.reason = remaining === 0 ? "quota" : "rate-limit";
    next.estimated = !retry && !resetAt;
  } else if (response.ok) {
    delete next.blockedUntil;
    delete next.reason;
    delete next.estimated;
  }
  return next;
}
export function abuseBlocked(state: AbuseLimits | undefined, now = Date.now()) {
  return (state?.blockedUntil ?? 0) > now;
}
