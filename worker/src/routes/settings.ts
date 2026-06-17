import type { UpdateOpenRouterKeyRequest, UserSettings } from '@shelf-analysis/shared';
import type { Env, UserRow } from '../types';
import { decryptSecret, encryptSecret, maskApiKey } from '../lib/secrets';
import { jsonError, jsonSuccess, parseJsonBody } from '../lib/response';
import { requireAuth, rowToUser } from '../middleware/auth';

const MIN_KEY_LENGTH = 10;

function isValidOpenRouterKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= MIN_KEY_LENGTH && !/\s/.test(trimmed);
}

/** GET /api/settings */
export async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare(
    'SELECT openrouter_api_key_encrypted FROM users WHERE id = ?',
  )
    .bind(auth.user.id)
    .first<Pick<UserRow, 'openrouter_api_key_encrypted'>>();

  const settings: UserSettings = {
    has_openrouter_api_key: Boolean(row?.openrouter_api_key_encrypted),
    openrouter_key_hint: null,
    uses_global_openrouter_key: false,
  };

  if (row?.openrouter_api_key_encrypted) {
    const decrypted = await decryptSecret(row.openrouter_api_key_encrypted, env.JWT_SECRET);
    settings.openrouter_key_hint = decrypted ? maskApiKey(decrypted) : null;
  } else if (env.OPENROUTER_API_KEY) {
    settings.uses_global_openrouter_key = true;
  }

  return jsonSuccess({ settings });
}

/** PUT /api/settings/openrouter-key */
export async function handleUpdateOpenRouterKey(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<UpdateOpenRouterKeyRequest>(request);
  if (!body || body.openrouter_api_key === undefined) {
    return jsonError('VALIDATION_ERROR', 'openrouter_api_key is required (use null to remove)', 400);
  }

  if (body.openrouter_api_key === null || body.openrouter_api_key === '') {
    await env.DB.prepare('UPDATE users SET openrouter_api_key_encrypted = NULL WHERE id = ?')
      .bind(auth.user.id)
      .run();
  } else {
    const key = body.openrouter_api_key.trim();
    if (!isValidOpenRouterKey(key)) {
      return jsonError(
        'VALIDATION_ERROR',
        'Invalid API key format. Provide a valid OpenRouter key (min 10 characters, no spaces)',
        400,
      );
    }

    const encrypted = await encryptSecret(key, env.JWT_SECRET);
    await env.DB.prepare('UPDATE users SET openrouter_api_key_encrypted = ? WHERE id = ?')
      .bind(encrypted, auth.user.id)
      .run();
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<UserRow>();

  if (!row) {
    return jsonError('NOT_FOUND', 'User not found', 404);
  }

  const settings: UserSettings = {
    has_openrouter_api_key: Boolean(row.openrouter_api_key_encrypted),
    openrouter_key_hint: null,
    uses_global_openrouter_key: false,
  };

  if (row.openrouter_api_key_encrypted) {
    const decrypted = await decryptSecret(row.openrouter_api_key_encrypted, env.JWT_SECRET);
    settings.openrouter_key_hint = decrypted ? maskApiKey(decrypted) : null;
  } else if (env.OPENROUTER_API_KEY) {
    settings.uses_global_openrouter_key = true;
  }

  return jsonSuccess({ settings, user: rowToUser(row) });
}
