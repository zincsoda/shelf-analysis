import type { PerceptronBoxRow } from '../types';
import { jsonError } from '../lib/response';
import { hashDeviceToken } from '../lib/device-token';
import type { Env } from '../types';

export interface AuthDevice {
  id: string;
  user_id: string;
  name: string;
  poll_interval_seconds: number;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Authenticate a Perceptron Box via Bearer device token */
export async function requireDeviceAuth(
  request: Request,
  env: Env,
): Promise<{ device: AuthDevice } | Response> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonError('UNAUTHORIZED', 'Device token required (Authorization: Bearer …)', 401);
  }

  const tokenHash = await hashDeviceToken(token);
  const row = await env.DB.prepare('SELECT * FROM perceptron_boxes WHERE device_token_hash = ?')
    .bind(tokenHash)
    .first<PerceptronBoxRow>();

  if (!row) {
    return jsonError('UNAUTHORIZED', 'Invalid device token', 401);
  }

  return {
    device: {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      poll_interval_seconds: row.poll_interval_seconds,
    },
  };
}
