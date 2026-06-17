const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/**
 * Hash a password using PBKDF2-SHA256 (Web Crypto API).
 * Stored format: pbkdf2:<iterations>:<base64-salt>:<base64-hash>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${btoa(String.fromCharCode(...salt))}:${btoa(String.fromCharCode(...hash))}`;
}

/** Verify a password against a stored PBKDF2 hash */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = parseInt(parts[1], 10);
  if (iterations !== PBKDF2_ITERATIONS) return false;

  const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const actualHash = await deriveKey(password, salt, iterations);

  // Constant-time comparison
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}
