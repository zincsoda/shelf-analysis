import type { LoginRequest } from '@shelf-analysis/shared';
import type { Env, UserRow } from '../types';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt } from '../lib/jwt';
import {
  buildAuthCookie,
  clearAuthCookie,
  isSecureRequest,
  isValidEmail,
  isValidPassword,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from '../lib/response';
import { checkRateLimit, clearRateLimit, rateLimitKey, recordFailedAttempt } from '../lib/rate-limit';
import { requireAuth, rowToUser } from '../middleware/auth';

/** POST /api/login */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<LoginRequest>(request);
  if (!body?.email || !body?.password) {
    return jsonError('VALIDATION_ERROR', 'Email and password are required', 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return jsonError('VALIDATION_ERROR', 'Invalid email format', 400);
  }

  // Rate limit check
  const rlKey = rateLimitKey(email);
  const rateCheck = await checkRateLimit(env.RATE_LIMIT, rlKey);
  if (!rateCheck.allowed) {
    return jsonError(
      'RATE_LIMITED',
      `Too many login attempts. Try again in ${rateCheck.retryAfter} seconds`,
      429,
    );
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!row || !(await verifyPassword(body.password, row.password_hash))) {
    await recordFailedAttempt(env.RATE_LIMIT, rlKey);
    return jsonError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  if (row.is_active !== 1) {
    return jsonError('ACCOUNT_DISABLED', 'Your account has been disabled', 403);
  }

  await clearRateLimit(env.RATE_LIMIT, rlKey);

  const token = await signJwt(
    { sub: row.id, email: row.email, role: row.role },
    env.JWT_SECRET,
  );

  const secure = isSecureRequest(request);
  const response = jsonSuccess({ user: rowToUser(row) });
  response.headers.set('Set-Cookie', buildAuthCookie(token, secure));
  return response;
}

/** POST /api/logout */
export async function handleLogout(request: Request): Promise<Response> {
  const secure = isSecureRequest(request);
  const response = jsonSuccess({ message: 'Logged out' });
  response.headers.set('Set-Cookie', clearAuthCookie(secure));
  return response;
}

/** GET /api/me */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<UserRow>();

  if (!row) {
    return jsonError('NOT_FOUND', 'User not found', 404);
  }

  return jsonSuccess({ user: rowToUser(row) });
}

export { hashPassword, isValidPassword };
