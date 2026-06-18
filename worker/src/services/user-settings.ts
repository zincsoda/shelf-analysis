import { AI_MODELS } from '@shelf-analysis/shared';
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

/** Parse stored model selection or return defaults */
export function parseSelectedModels(raw: string | null | undefined): string[] {
  if (!raw) return [...AI_MODELS];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...AI_MODELS];

    const models = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return models.length > 0 ? models : [...AI_MODELS];
  } catch {
    return [...AI_MODELS];
  }
}

/** Drop model IDs that are no longer offered by OpenRouter */
export function filterSelectedModelsToAvailable(
  selected: string[],
  availableIds: ReadonlySet<string>,
): string[] {
  return selected.filter((id) => availableIds.has(id));
}

/** Prefer stored selection, then defaults, then any available models */
export function resolveSelectedModels(
  stored: string[],
  availableIds: ReadonlySet<string>,
  availableIdsList: string[],
): string[] {
  const fromStored = filterSelectedModelsToAvailable(stored, availableIds);
  if (fromStored.length > 0) return fromStored;

  const fromDefaults = filterSelectedModelsToAvailable([...AI_MODELS], availableIds);
  if (fromDefaults.length > 0) return fromDefaults;

  return availableIdsList.slice(0, 4);
}

/** Load the user's selected models from D1 */
export async function getUserSelectedModels(env: Env, userId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT selected_models FROM users WHERE id = ?')
    .bind(userId)
    .first<Pick<UserRow, 'selected_models'>>();

  return parseSelectedModels(row?.selected_models);
}
