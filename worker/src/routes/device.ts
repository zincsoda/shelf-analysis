import type { DeviceConfig } from '@shelf-analysis/shared';
import type { CameraRow, Env } from '../types';
import { requireDeviceAuth } from '../middleware/device-auth';
import { jsonError, jsonSuccess } from '../lib/response';
import { storeCameraSnapshot, validateImage } from '../services/storage';

/** GET /api/device/config — cameras this box should poll locally */
export async function handleDeviceConfig(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeviceAuth(request, env);
  if (auth instanceof Response) return auth;

  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE perceptron_boxes SET last_seen_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, auth.device.id)
    .run();

  const { results } = await env.DB.prepare(
    `SELECT id, name, stream_url
     FROM cameras
     WHERE perceptron_box_id = ? AND type = 'real' AND stream_url IS NOT NULL
     ORDER BY name ASC`,
  )
    .bind(auth.device.id)
    .all<Pick<CameraRow, 'id' | 'name' | 'stream_url'>>();

  const config: DeviceConfig = {
    box: {
      id: auth.device.id,
      name: auth.device.name,
      poll_interval_seconds: auth.device.poll_interval_seconds,
    },
    cameras: results.map((row) => ({
      id: row.id,
      name: row.name,
      stream_url: row.stream_url!,
    })),
  };

  return jsonSuccess({ config });
}

/** POST /api/device/cameras/:cameraId/snapshot — upload a polled snapshot from the edge device */
export async function handleDeviceUploadSnapshot(
  request: Request,
  env: Env,
  cameraId: string,
): Promise<Response> {
  const auth = await requireDeviceAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare(
    `SELECT * FROM cameras
     WHERE id = ? AND perceptron_box_id = ? AND user_id = ?`,
  )
    .bind(cameraId, auth.device.id, auth.device.user_id)
    .first<CameraRow>();

  if (!row) {
    return jsonError('NOT_FOUND', 'Camera not found on this Perceptron Box', 404);
  }

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
    row.user_id,
    cameraId,
    bytes,
    validated.mimeType,
  );

  if (row.snapshot_key && row.snapshot_key !== key) {
    await env.IMAGES.delete(row.snapshot_key);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE cameras SET snapshot_key = ?, updated_at = ? WHERE id = ?').bind(
      key,
      now,
      cameraId,
    ),
    env.DB.prepare('UPDATE perceptron_boxes SET last_seen_at = ?, updated_at = ? WHERE id = ?').bind(
      now,
      now,
      auth.device.id,
    ),
  ]);

  return jsonSuccess({ message: 'Snapshot uploaded', camera_id: cameraId, updated_at: now });
}
