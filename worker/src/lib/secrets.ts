const IV_BYTES = 12;

/** Derive a 256-bit AES key from the app secret */
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypt a secret for storage. Format: aesgcm:{iv,ciphertext} as base64 JSON */
export async function encryptSecret(plaintext: string, appSecret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(appSecret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `aesgcm:${JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  })}`;
}

/** Decrypt a stored secret */
export async function decryptSecret(stored: string, appSecret: string): Promise<string | null> {
  if (!stored.startsWith('aesgcm:')) return null;

  let payload: { iv: string; ciphertext: string };
  try {
    payload = JSON.parse(stored.slice('aesgcm:'.length)) as { iv: string; ciphertext: string };
  } catch {
    return null;
  }

  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
  const key = await deriveAesKey(appSecret);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Mask an API key for display (last 4 chars only) */
export function maskApiKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}
