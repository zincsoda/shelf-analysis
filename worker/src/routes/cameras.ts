import type {
  Camera,
  CameraWithZones,
  CameraZone,
  CreateCameraRequest,
  CreateZoneRequest,
  UpdateCameraRequest,
  UpdateZoneRequest,
} from '@shelf-analysis/shared';
import type { Env, CameraRow, CameraZoneRow } from '../types';
import { requireAuth } from '../middleware/auth';
import { jsonError, jsonSuccess, parseJsonBody } from '../lib/response';
import { getImage, storeCameraSnapshot, validateImage } from '../services/storage';

function rowToCamera(
  row: CameraRow & { perceptron_box_name?: string | null },
  zoneCount: number,
): Camera {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type,
    stream_url: row.stream_url,
    perceptron_box_id: row.perceptron_box_id,
    perceptron_box_name: row.perceptron_box_name ?? null,
    has_snapshot: Boolean(row.snapshot_key),
    zone_count: zoneCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToZone(row: CameraZoneRow): CameraZone {
  return {
    id: row.id,
    camera_id: row.camera_id,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    created_at: row.created_at,
  };
}

async function getCameraForUser(
  env: Env,
  cameraId: string,
  userId: string,
): Promise<CameraRow | null> {
  return env.DB.prepare('SELECT * FROM cameras WHERE id = ? AND user_id = ?')
    .bind(cameraId, userId)
    .first<CameraRow>();
}

async function getBoxForUser(
  env: Env,
  boxId: string,
  userId: string,
): Promise<{ id: string } | null> {
  return env.DB.prepare('SELECT id FROM perceptron_boxes WHERE id = ? AND user_id = ?')
    .bind(boxId, userId)
    .first<{ id: string }>();
}

async function getZoneCount(env: Env, cameraId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM camera_zones WHERE camera_id = ?')
    .bind(cameraId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'rtsp:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidNormalizedRect(x: number, y: number, width: number, height: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

/** GET /api/cameras */
export async function handleListCameras(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { results } = await env.DB.prepare(
    `SELECT c.*, b.name as perceptron_box_name, COUNT(z.id) as zone_count
     FROM cameras c
     LEFT JOIN perceptron_boxes b ON b.id = c.perceptron_box_id
     LEFT JOIN camera_zones z ON z.camera_id = c.id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )
    .bind(auth.user.id)
    .all<CameraRow & { perceptron_box_name: string | null; zone_count: number }>();

  const cameras = results.map((row) => rowToCamera(row, row.zone_count));
  return jsonSuccess({ cameras });
}

/** POST /api/cameras */
export async function handleCreateCamera(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<CreateCameraRequest>(request);
  if (!body?.name?.trim()) {
    return jsonError('VALIDATION_ERROR', 'Camera name is required', 400);
  }
  if (body.type !== 'virtual' && body.type !== 'real') {
    return jsonError('VALIDATION_ERROR', 'Type must be virtual or real', 400);
  }

  const streamUrl = body.stream_url?.trim() || null;
  const perceptronBoxId = body.perceptron_box_id?.trim() || null;

  if (!perceptronBoxId) {
    return jsonError('VALIDATION_ERROR', 'Perceptron Box is required', 400);
  }
  const box = await getBoxForUser(env, perceptronBoxId, auth.user.id);
  if (!box) {
    return jsonError('VALIDATION_ERROR', 'Perceptron Box not found', 400);
  }

  if (body.type === 'real') {
    if (!streamUrl) {
      return jsonError('VALIDATION_ERROR', 'Stream URL is required for real cameras', 400);
    }
    if (!isValidStreamUrl(streamUrl)) {
      return jsonError('VALIDATION_ERROR', 'Stream URL must be http, https, or rtsp', 400);
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO cameras (id, user_id, name, type, stream_url, perceptron_box_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, auth.user.id, body.name.trim(), body.type, streamUrl, perceptronBoxId, now, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT c.*, b.name as perceptron_box_name
     FROM cameras c
     LEFT JOIN perceptron_boxes b ON b.id = c.perceptron_box_id
     WHERE c.id = ?`,
  )
    .bind(id)
    .first<CameraRow & { perceptron_box_name: string | null }>();
  return jsonSuccess({ camera: rowToCamera(row!, 0) }, 201);
}

/** GET /api/cameras/:id */
export async function handleGetCamera(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare(
    `SELECT c.*, b.name as perceptron_box_name
     FROM cameras c
     LEFT JOIN perceptron_boxes b ON b.id = c.perceptron_box_id
     WHERE c.id = ? AND c.user_id = ?`,
  )
    .bind(cameraId, auth.user.id)
    .first<CameraRow & { perceptron_box_name: string | null }>();
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const { results } = await env.DB.prepare(
    'SELECT * FROM camera_zones WHERE camera_id = ? ORDER BY created_at ASC',
  )
    .bind(cameraId)
    .all<CameraZoneRow>();

  const camera: CameraWithZones = {
    ...rowToCamera(row, results.length),
    zones: results.map(rowToZone),
  };

  return jsonSuccess({ camera });
}

/** PUT /api/cameras/:id */
export async function handleUpdateCamera(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const body = await parseJsonBody<UpdateCameraRequest>(request);
  if (
    !body ||
    (body.name === undefined &&
      body.stream_url === undefined &&
      body.perceptron_box_id === undefined)
  ) {
    return jsonError(
      'VALIDATION_ERROR',
      'At least one field (name, stream_url, perceptron_box_id) is required',
      400,
    );
  }

  const name = body.name !== undefined ? body.name.trim() : row.name;
  if (!name) return jsonError('VALIDATION_ERROR', 'Camera name cannot be empty', 400);

  let streamUrl = row.stream_url;
  if (body.stream_url !== undefined) {
    streamUrl = body.stream_url?.trim() || null;
    if (row.type === 'real') {
      if (!streamUrl) {
        return jsonError('VALIDATION_ERROR', 'Stream URL is required for real cameras', 400);
      }
      if (!isValidStreamUrl(streamUrl)) {
        return jsonError('VALIDATION_ERROR', 'Stream URL must be http, https, or rtsp', 400);
      }
    }
  }

  let perceptronBoxId = row.perceptron_box_id;
  if (body.perceptron_box_id !== undefined) {
    perceptronBoxId = body.perceptron_box_id?.trim() || null;
    if (!perceptronBoxId) {
      return jsonError('VALIDATION_ERROR', 'Perceptron Box is required', 400);
    }
    const box = await getBoxForUser(env, perceptronBoxId, auth.user.id);
    if (!box) {
      return jsonError('VALIDATION_ERROR', 'Perceptron Box not found', 400);
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE cameras SET name = ?, stream_url = ?, perceptron_box_id = ?, updated_at = ? WHERE id = ?',
  )
    .bind(name, streamUrl, perceptronBoxId, now, cameraId)
    .run();

  const updated = await env.DB.prepare(
    `SELECT c.*, b.name as perceptron_box_name
     FROM cameras c
     LEFT JOIN perceptron_boxes b ON b.id = c.perceptron_box_id
     WHERE c.id = ?`,
  )
    .bind(cameraId)
    .first<CameraRow & { perceptron_box_name: string | null }>();
  const zoneCount = await getZoneCount(env, cameraId);
  return jsonSuccess({ camera: rowToCamera(updated!, zoneCount) });
}

/** DELETE /api/cameras/:id */
export async function handleDeleteCamera(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  if (row.snapshot_key) {
    await env.IMAGES.delete(row.snapshot_key);
  }

  await env.DB.prepare('DELETE FROM cameras WHERE id = ?').bind(cameraId).run();
  return jsonSuccess({ message: 'Camera deleted' });
}

/** POST /api/cameras/:id/snapshot — upload reference frame */
export async function handleUploadCameraSnapshot(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const form = await request.formData();
  const file = form.get('image');

  if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
    return jsonError('VALIDATION_ERROR', 'Image file is required', 400);
  }
  const uploadFile = file as File;

  const validated = validateImage(uploadFile);
  if ('error' in validated) {
    return jsonError('VALIDATION_ERROR', validated.error, 400);
  }

  const bytes = await uploadFile.arrayBuffer();
  const key = await storeCameraSnapshot(
    env.IMAGES,
    auth.user.id,
    cameraId,
    bytes,
    validated.mimeType,
  );

  if (row.snapshot_key && row.snapshot_key !== key) {
    await env.IMAGES.delete(row.snapshot_key);
  }

  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE cameras SET snapshot_key = ?, updated_at = ? WHERE id = ?')
    .bind(key, now, cameraId)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM cameras WHERE id = ?').bind(cameraId).first<CameraRow>();
  const zoneCount = await getZoneCount(env, cameraId);
  return jsonSuccess({ camera: rowToCamera(updated!, zoneCount) });
}

/** GET /api/cameras/:id/preview */
export async function handleGetCameraPreview(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  if (row.snapshot_key) {
    const object = await getImage(env.IMAGES, row.snapshot_key);
    if (object) {
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
      headers.set('Cache-Control', 'private, max-age=60');
      return new Response(object.body, { headers });
    }
  }

  const svg = buildPlaceholderSvg(row.name, row.type);
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'private, max-age=60',
    },
  });
}

/** POST /api/cameras/:id/zones */
export async function handleCreateZone(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const body = await parseJsonBody<CreateZoneRequest>(request);
  if (!body?.name?.trim()) {
    return jsonError('VALIDATION_ERROR', 'Zone name is required', 400);
  }
  if (!isValidNormalizedRect(body.x, body.y, body.width, body.height)) {
    return jsonError('VALIDATION_ERROR', 'Invalid zone coordinates', 400);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO camera_zones (id, camera_id, name, x, y, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, cameraId, body.name.trim(), body.x, body.y, body.width, body.height)
    .run();

  const zoneRow = await env.DB.prepare('SELECT * FROM camera_zones WHERE id = ?')
    .bind(id)
    .first<CameraZoneRow>();

  return jsonSuccess({ zone: rowToZone(zoneRow!) }, 201);
}

/** PUT /api/cameras/:id/zones/:zoneId */
export async function handleUpdateZone(
  request: Request,
  env: Env,
  cameraId: string,
  zoneId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const zoneRow = await env.DB.prepare('SELECT * FROM camera_zones WHERE id = ? AND camera_id = ?')
    .bind(zoneId, cameraId)
    .first<CameraZoneRow>();
  if (!zoneRow) return jsonError('NOT_FOUND', 'Zone not found', 404);

  const body = await parseJsonBody<UpdateZoneRequest>(request);
  if (!body || (body.name === undefined && body.x === undefined && body.y === undefined && body.width === undefined && body.height === undefined)) {
    return jsonError('VALIDATION_ERROR', 'At least one field is required', 400);
  }

  const name = body.name !== undefined ? body.name.trim() : zoneRow.name;
  if (!name) return jsonError('VALIDATION_ERROR', 'Zone name cannot be empty', 400);

  const x = body.x ?? zoneRow.x;
  const y = body.y ?? zoneRow.y;
  const width = body.width ?? zoneRow.width;
  const height = body.height ?? zoneRow.height;

  if (!isValidNormalizedRect(x, y, width, height)) {
    return jsonError('VALIDATION_ERROR', 'Invalid zone coordinates', 400);
  }

  await env.DB.prepare(
    'UPDATE camera_zones SET name = ?, x = ?, y = ?, width = ?, height = ? WHERE id = ?',
  )
    .bind(name, x, y, width, height, zoneId)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM camera_zones WHERE id = ?')
    .bind(zoneId)
    .first<CameraZoneRow>();

  return jsonSuccess({ zone: rowToZone(updated!) });
}

/** DELETE /api/cameras/:id/zones/:zoneId */
export async function handleDeleteZone(
  request: Request,
  env: Env,
  cameraId: string,
  zoneId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await getCameraForUser(env, cameraId, auth.user.id);
  if (!row) return jsonError('NOT_FOUND', 'Camera not found', 404);

  const result = await env.DB.prepare('DELETE FROM camera_zones WHERE id = ? AND camera_id = ?')
    .bind(zoneId, cameraId)
    .run();

  if (!result.meta.changes) {
    return jsonError('NOT_FOUND', 'Zone not found', 404);
  }

  return jsonSuccess({ message: 'Zone deleted' });
}

function buildPlaceholderSvg(name: string, type: string): string {
  const label = type === 'virtual' ? 'Virtual Camera' : 'IP Camera';
  const escapedName = escapeXml(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#1a2332"/>
  <rect x="1" y="1" width="958" height="538" fill="none" stroke="#2d3a4f" stroke-width="2"/>
  <g fill="#8b9cb3" font-family="system-ui, sans-serif" text-anchor="middle">
    <text x="480" y="240" font-size="28" fill="#e8edf5">${escapedName}</text>
    <text x="480" y="280" font-size="16">${label}</text>
    <text x="480" y="320" font-size="14">Upload a reference frame to draw zones</text>
  </g>
  <circle cx="480" cy="160" r="36" fill="none" stroke="#3b82f6" stroke-width="3"/>
  <rect x="456" y="148" width="48" height="32" rx="4" fill="none" stroke="#3b82f6" stroke-width="3"/>
</svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
