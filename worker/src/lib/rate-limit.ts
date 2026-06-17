/** Login rate limiting via KV — 5 attempts per 15 minutes per email */

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

interface RateLimitRecord {
  attempts: number;
  windowStart: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Math.floor(Date.now() / 1000);
  const raw = await kv.get(key);

  if (!raw) {
    return { allowed: true };
  }

  const record = JSON.parse(raw) as RateLimitRecord;
  const elapsed = now - record.windowStart;

  if (elapsed >= WINDOW_SECONDS) {
    return { allowed: true };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: WINDOW_SECONDS - elapsed };
  }

  return { allowed: true };
}

export async function recordFailedAttempt(kv: KVNamespace, key: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const raw = await kv.get(key);

  let record: RateLimitRecord;
  if (!raw) {
    record = { attempts: 1, windowStart: now };
  } else {
    const existing = JSON.parse(raw) as RateLimitRecord;
    const elapsed = now - existing.windowStart;
    if (elapsed >= WINDOW_SECONDS) {
      record = { attempts: 1, windowStart: now };
    } else {
      record = { attempts: existing.attempts + 1, windowStart: existing.windowStart };
    }
  }

  await kv.put(key, JSON.stringify(record), { expirationTtl: WINDOW_SECONDS });
}

export async function clearRateLimit(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

export function rateLimitKey(email: string): string {
  return `login:${email.toLowerCase()}`;
}
