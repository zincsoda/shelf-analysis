import type {
  CreatePerceptronBoxRequest,
  PerceptronBox,
  PerceptronBoxWithToken,
  UpdatePerceptronBoxRequest,
} from '@shelf-analysis/shared';
import type { Env, PerceptronBoxRow } from '../types';
import { requireAuth } from '../middleware/auth';
import { jsonError, jsonSuccess, parseJsonBody } from '../lib/response';
import { generateDeviceToken, hashDeviceToken } from '../lib/device-token';

function rowToBox(row: PerceptronBoxRow, cameraCount: number): PerceptronBox {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    poll_interval_seconds: row.poll_interval_seconds,
    camera_count: cameraCount,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getBoxForUser(
  env: Env,
  boxId: string,
  userId: string,
): Promise<PerceptronBoxRow | null> {
  return env.DB.prepare('SELECT * FROM perceptron_boxes WHERE id = ? AND user_id = ?')
    .bind(boxId, userId)
    .first<PerceptronBoxRow>();
}

async function getCameraCount(env: Env, boxId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM cameras WHERE perceptron_box_id = ?',
  )
    .bind(boxId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** GET /api/perceptron-boxes */
export async function handleListPerceptronBoxes(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { results } = await env.DB.prepare(
    `SELECT b.*, COUNT(c.id) as camera_count
     FROM perceptron_boxes b
     LEFT JOIN cameras c ON c.perceptron_box_id = b.id
     WHERE b.user_id = ?
     GROUP BY b.id
     ORDER BY b.created_at DESC`,
  )
    .bind(auth.user.id)
    .all<PerceptronBoxRow & { camera_count: number }>();

  const boxes = results.map((row) => rowToBox(row, row.camera_count));
  return jsonSuccess({ boxes });
}

/** POST /api/perceptron-boxes */
export async function handleCreatePerceptronBox(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<CreatePerceptronBoxRequest>(request);
  if (!body?.name?.trim()) {
    return jsonError('VALIDATION_ERROR', 'Name is required', 400);
  }

  const pollInterval = body.poll_interval_seconds ?? 60;
  if (!Number.isInteger(pollInterval) || pollInterval < 10) {
    return jsonError('VALIDATION_ERROR', 'Poll interval must be at least 10 seconds', 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const deviceToken = generateDeviceToken();
  const deviceTokenHash = await hashDeviceToken(deviceToken);

  await env.DB.prepare(
    `INSERT INTO perceptron_boxes
     (id, user_id, name, device_token_hash, poll_interval_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, auth.user.id, body.name.trim(), deviceTokenHash, pollInterval, now, now)
    .run();

  const row = await env.DB.prepare('SELECT * FROM perceptron_boxes WHERE id = ?')
    .bind(id)
    .first<PerceptronBoxRow>();

  const box: PerceptronBoxWithToken = {
    ...rowToBox(row!, 0),
    device_token: deviceToken,
  };

  return jsonSuccess({ box }, 201);
}

/** GET /api/perceptron-boxes/:id */
export async function handleGetPerceptronBox(
  request: Request,
  env: Env,
  boxId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getBoxForUser(env, boxId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Perceptron Box not found', 404);

  const cameraCount = await getCameraCount(env, boxId);
  return jsonSuccess({ box: rowToBox(row, cameraCount) });
}

/** PUT /api/perceptron-boxes/:id */
export async function handleUpdatePerceptronBox(
  request: Request,
  env: Env,
  boxId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getBoxForUser(env, boxId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Perceptron Box not found', 404);

  const body = await parseJsonBody<UpdatePerceptronBoxRequest>(request);
  if (!body || (body.name === undefined && body.poll_interval_seconds === undefined)) {
    return jsonError('VALIDATION_ERROR', 'At least one field (name, poll_interval_seconds) is required', 400);
  }

  const name = body.name !== undefined ? body.name.trim() : row.name;
  if (!name) return jsonError('VALIDATION_ERROR', 'Name cannot be empty', 400);

  const pollInterval =
    body.poll_interval_seconds !== undefined ? body.poll_interval_seconds : row.poll_interval_seconds;
  if (!Number.isInteger(pollInterval) || pollInterval < 10) {
    return jsonError('VALIDATION_ERROR', 'Poll interval must be at least 10 seconds', 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE perceptron_boxes SET name = ?, poll_interval_seconds = ?, updated_at = ? WHERE id = ?',
  )
    .bind(name, pollInterval, now, boxId)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM perceptron_boxes WHERE id = ?')
    .bind(boxId)
    .first<PerceptronBoxRow>();
  const cameraCount = await getCameraCount(env, boxId);
  return jsonSuccess({ box: rowToBox(updated!, cameraCount) });
}

/** DELETE /api/perceptron-boxes/:id */
export async function handleDeletePerceptronBox(
  request: Request,
  env: Env,
  boxId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getBoxForUser(env, boxId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Perceptron Box not found', 404);

  await env.DB.prepare('DELETE FROM perceptron_boxes WHERE id = ?').bind(boxId).run();
  return jsonSuccess({ message: 'Perceptron Box deleted' });
}

/** POST /api/perceptron-boxes/:id/regenerate-token */
export async function handleRegenerateDeviceToken(
  request: Request,
  env: Env,
  boxId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getBoxForUser(env, boxId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Perceptron Box not found', 404);

  const deviceToken = generateDeviceToken();
  const deviceTokenHash = await hashDeviceToken(deviceToken);
  const now = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE perceptron_boxes SET device_token_hash = ?, updated_at = ? WHERE id = ?',
  )
    .bind(deviceTokenHash, now, boxId)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM perceptron_boxes WHERE id = ?')
    .bind(boxId)
    .first<PerceptronBoxRow>();
  const cameraCount = await getCameraCount(env, boxId);

  const box: PerceptronBoxWithToken = {
    ...rowToBox(updated!, cameraCount),
    device_token: deviceToken,
  };

  return jsonSuccess({ box });
}
