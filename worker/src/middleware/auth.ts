import type { User } from '@shelf-analysis/shared';
import type { AuthUser, Env, UserRow } from '../types';
import { getTokenFromCookie, jsonError } from '../lib/response';
import { verifyJwt } from '../lib/jwt';

/** Convert DB row to public User object */
export function rowToUser(row: UserRow | Pick<UserRow, 'id' | 'email' | 'role' | 'is_active' | 'created_at' | 'openrouter_api_key_encrypted'>): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    has_openrouter_api_key: Boolean(
      'openrouter_api_key_encrypted' in row && row.openrouter_api_key_encrypted,
    ),
  };
}

/** JWT verification middleware — attaches user to context */
export async function requireAuth(
  request: Request,
  env: Env,
): Promise<{ user: AuthUser } | Response> {
  const token = getTokenFromCookie(request);
  if (!token) {
    return jsonError('UNAUTHORIZED', 'Authentication required', 401);
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    return jsonError('UNAUTHORIZED', 'Invalid or expired session', 401);
  }

  // Verify user still exists and is active
  const row = await env.DB.prepare(
    'SELECT id, email, role, is_active FROM users WHERE id = ?',
  )
    .bind(payload.sub)
    .first<Pick<UserRow, 'id' | 'email' | 'role' | 'is_active'>>();

  if (!row || row.is_active !== 1) {
    return jsonError('UNAUTHORIZED', 'Account is disabled or not found', 401);
  }

  return {
    user: { id: row.id, email: row.email, role: row.role },
  };
}

/** Admin-only middleware — must run after requireAuth */
export function requireAdmin(user: AuthUser): Response | null {
  if (user.role !== 'admin') {
    return jsonError('FORBIDDEN', 'Admin access required', 403);
  }
  return null;
}
