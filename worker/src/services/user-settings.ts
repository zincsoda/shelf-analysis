import type { Env, UserRow } from '../types';
import { decryptSecret } from '../lib/secrets';

/** Resolve the OpenRouter API key for a user (user key first, then global fallback) */
export async function resolveOpenRouterApiKey(
  env: Env,
  userId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT openrouter_api_key_encrypted FROM users WHERE id = ?',
  )
    .bind(userId)
    .first<Pick<UserRow, 'openrouter_api_key_encrypted'>>();

  if (row?.openrouter_api_key_encrypted) {
    const decrypted = await decryptSecret(row.openrouter_api_key_encrypted, env.JWT_SECRET);
    if (decrypted) return decrypted;
  }

  return env.OPENROUTER_API_KEY || null;
}
