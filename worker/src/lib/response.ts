import type { ApiResponse } from '@shelf-analysis/shared';

/** Build a JSON success response */
export function jsonSuccess<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body, { status });
}

/** Build a JSON error response */
export function jsonError(code: string, message: string, status: number): Response {
  const body: ApiResponse<never> = {
    success: false,
    error: { code, message },
  };
  return Response.json(body, { status });
}

/** Parse JSON body safely */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Standard CORS headers for credentialed requests */
export function corsHeaders(configuredOrigin: string, request?: Request): HeadersInit {
  const requestOrigin = request?.headers.get('Origin') ?? null;
  const allowOrigin = resolveAllowedOrigin(configuredOrigin, requestOrigin);

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/** Allow localhost origins during local development */
function resolveAllowedOrigin(configuredOrigin: string, requestOrigin: string | null): string {
  if (requestOrigin && (requestOrigin === configuredOrigin || isLocalDevOrigin(requestOrigin))) {
    return requestOrigin;
  }
  return configuredOrigin;
}

function isLocalDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** Auth cookie name */
export const AUTH_COOKIE = 'auth_token';

/** JWT lifetime: 7 days in seconds */
export const JWT_MAX_AGE = 7 * 24 * 60 * 60;

/** Build Set-Cookie header for JWT */
export function buildAuthCookie(token: string, secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${JWT_MAX_AGE}`,
    // Pages (frontend) and Workers (API) are on different origins.
    // SameSite=None is required for credentialed cross-origin requests.
    'SameSite=None',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Build Set-Cookie header to clear auth */
export function clearAuthCookie(secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=None',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Extract JWT from cookie header */
export function getTokenFromCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

/** Check if request is over HTTPS (or local dev) */
export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === 'https:' || url.hostname === 'localhost';
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate password strength (min 8 chars) */
export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8;
}
