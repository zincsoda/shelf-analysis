import type { CreateUserRequest, UpdateUserRequest } from '@shelf-analysis/shared';
import type { Env, UserRow } from '../types';
import { hashPassword, isValidPassword } from './auth';
import { requireAdmin, requireAuth, rowToUser } from '../middleware/auth';
import { isValidEmail, jsonError, jsonSuccess, parseJsonBody } from '../lib/response';

/** GET /api/admin/users */
export async function handleListUsers(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const forbidden = requireAdmin(auth.user);
  if (forbidden) return forbidden;

  const { results } = await env.DB.prepare(
    'SELECT id, email, role, is_active, created_at, openrouter_api_key_encrypted FROM users ORDER BY created_at DESC',
  ).all<UserRow>();

  return jsonSuccess({ users: results.map(rowToUser) });
}

/** POST /api/admin/users */
export async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const forbidden = requireAdmin(auth.user);
  if (forbidden) return forbidden;

  const body = await parseJsonBody<CreateUserRequest>(request);
  if (!body?.email || !body?.password || !body?.role) {
    return jsonError('VALIDATION_ERROR', 'Email, password, and role are required', 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return jsonError('VALIDATION_ERROR', 'Invalid email format', 400);
  }
  if (!isValidPassword(body.password)) {
    return jsonError('VALIDATION_ERROR', 'Password must be at least 8 characters', 400);
  }
  if (body.role !== 'admin' && body.role !== 'user') {
    return jsonError('VALIDATION_ERROR', 'Role must be admin or user', 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
    return jsonError('CONFLICT', 'Email already registered', 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
  )
    .bind(id, email, passwordHash, body.role)
    .run();

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return jsonSuccess({ user: rowToUser(row!) }, 201);
}

/** PUT /api/admin/users/:id */
export async function handleUpdateUser(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const forbidden = requireAdmin(auth.user);
  if (forbidden) return forbidden;

  const body = await parseJsonBody<UpdateUserRequest>(request);
  if (!body || (!body.role && body.is_active === undefined && !body.password)) {
    return jsonError('VALIDATION_ERROR', 'At least one field (role, is_active, password) is required', 400);
  }

  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>();
  if (!existing) {
    return jsonError('NOT_FOUND', 'User not found', 404);
  }

  // Prevent admin from disabling/deleting themselves
  if (userId === auth.user.id && body.is_active === false) {
    return jsonError('FORBIDDEN', 'Cannot disable your own account', 403);
  }

  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'user') {
      return jsonError('VALIDATION_ERROR', 'Role must be admin or user', 400);
    }
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?')
      .bind(body.role, userId)
      .run();
  }

  if (body.is_active !== undefined) {
    await env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?')
      .bind(body.is_active ? 1 : 0, userId)
      .run();
  }

  if (body.password) {
    if (!isValidPassword(body.password)) {
      return jsonError('VALIDATION_ERROR', 'Password must be at least 8 characters', 400);
    }
    const passwordHash = await hashPassword(body.password);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, userId)
      .run();
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>();

  return jsonSuccess({ user: rowToUser(row!) });
}

/** DELETE /api/admin/users/:id */
export async function handleDeleteUser(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const forbidden = requireAdmin(auth.user);
  if (forbidden) return forbidden;

  if (userId === auth.user.id) {
    return jsonError('FORBIDDEN', 'Cannot delete your own account', 403);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
    .bind(userId)
    .first();
  if (!existing) {
    return jsonError('NOT_FOUND', 'User not found', 404);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return jsonSuccess({ message: 'User deleted' });
}
