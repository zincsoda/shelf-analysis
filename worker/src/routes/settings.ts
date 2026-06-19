import type {
  UpdateOpenRouterKeyRequest,
  UpdateSelectedModelsRequest,
  UserSettings,
} from '@shelf-analysis/shared';
import type { Env, UserRow } from '../types';
import { decryptSecret, encryptSecret, maskApiKey } from '../lib/secrets';
import { jsonError, jsonSuccess, parseJsonBody } from '../lib/response';
import { requireAuth, rowToUser } from '../middleware/auth';
import { fetchOpenRouterModels } from '../services/openrouter';
import { parseSelectedModels, resolveSelectedModels } from '../services/user-settings';

const MIN_KEY_LENGTH = 10;

function isValidOpenRouterKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= MIN_KEY_LENGTH && !/\s/.test(trimmed);
}

async function buildUserSettings(
  env: Env,
  row: Pick<UserRow, 'openrouter_api_key_encrypted' | 'selected_models'>,
  availableModelIds?: Set<string>,
  availableModelIdsList?: string[],
): Promise<UserSettings> {
  const stored = parseSelectedModels(row.selected_models);
  const selected_models =
    availableModelIds && availableModelIdsList
      ? resolveSelectedModels(stored, availableModelIds, availableModelIdsList)
      : stored;

  const settings: UserSettings = {
    has_openrouter_api_key: Boolean(row.openrouter_api_key_encrypted),
    openrouter_key_hint: null,
    selected_models,
  };

  if (row.openrouter_api_key_encrypted) {
    const decrypted = await decryptSecret(row.openrouter_api_key_encrypted, env.JWT_SECRET);
    settings.openrouter_key_hint = decrypted ? maskApiKey(decrypted) : null;
  }

  return settings;
}

async function loadAvailableModelIds(): Promise<{ ids: Set<string>; list: string[] }> {
  const models = await fetchOpenRouterModels();
  const list = models.map((model) => model.id);
  return { ids: new Set(list), list };
}

/** GET /api/settings */
export async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare(
    'SELECT openrouter_api_key_encrypted, selected_models FROM users WHERE id = ?',
  )
    .bind(auth.user.id)
    .first<Pick<UserRow, 'openrouter_api_key_encrypted' | 'selected_models'>>();

  let available: { ids: Set<string>; list: string[] } | undefined;
  try {
    available = await loadAvailableModelIds();
  } catch {
    /* fall back to stored values if OpenRouter is unreachable */
  }

  const settings = await buildUserSettings(
    env,
    row ?? { openrouter_api_key_encrypted: null, selected_models: null },
    available?.ids,
    available?.list,
  );

  return jsonSuccess({ settings });
}

/** GET /api/settings/openrouter-models */
export async function handleGetOpenRouterModels(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  try {
    const models = await fetchOpenRouterModels();
    return jsonSuccess({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch models from OpenRouter';
    return jsonError('UPSTREAM_ERROR', message, 502);
  }
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

  const settings = await buildUserSettings(env, row);

  return jsonSuccess({ settings, user: rowToUser(row) });
}

/** PUT /api/settings/selected-models */
export async function handleUpdateSelectedModels(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<UpdateSelectedModelsRequest>(request);
  if (!body || !Array.isArray(body.selected_models)) {
    return jsonError('VALIDATION_ERROR', 'selected_models must be an array of model IDs', 400);
  }

  const uniqueModels = [...new Set(
    body.selected_models.filter((model): model is string => typeof model === 'string' && model.trim().length > 0),
  )];

  if (uniqueModels.length === 0) {
    return jsonError('VALIDATION_ERROR', 'Select at least one model', 400);
  }

  let availableModels: Set<string>;
  let availableModelIdsList: string[];
  try {
    const available = await loadAvailableModelIds();
    availableModels = available.ids;
    availableModelIdsList = available.list;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate models with OpenRouter';
    return jsonError('UPSTREAM_ERROR', message, 502);
  }

  const validModels = uniqueModels.filter((model) => availableModels.has(model));
  if (validModels.length === 0) {
    return jsonError('VALIDATION_ERROR', 'Select at least one supported model', 400);
  }

  await env.DB.prepare('UPDATE users SET selected_models = ? WHERE id = ?')
    .bind(JSON.stringify(validModels), auth.user.id)
    .run();

  const row = await env.DB.prepare(
    'SELECT openrouter_api_key_encrypted, selected_models FROM users WHERE id = ?',
  )
    .bind(auth.user.id)
    .first<Pick<UserRow, 'openrouter_api_key_encrypted' | 'selected_models'>>();

  const settings = await buildUserSettings(
    env,
    row ?? { openrouter_api_key_encrypted: null, selected_models: null },
    availableModels,
    availableModelIdsList,
  );

  return jsonSuccess({ settings });
}
