import type { Env } from './types';
import { corsHeaders, jsonError } from './lib/response';
import { handleLogin, handleLogout, handleMe } from './routes/auth';
import {
  handleCreateUser,
  handleDeleteUser,
  handleListUsers,
  handleUpdateUser,
} from './routes/admin';
import {
  handleAnalyze,
  handleGetAnalysis,
  handleGetImage,
  handleListAnalyses,
} from './routes/analyses';
import { handleGetSettings, handleGetOpenRouterModels, handleUpdateOpenRouterKey, handleUpdateSelectedModels } from './routes/settings';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env.FRONTEND_URL, request),
      });
    }

    let response: Response;

    try {
      response = await route(request, env, pathname, method);
    } catch (err) {
      console.error('Unhandled error:', err);
      response = jsonError(
        'INTERNAL_ERROR',
        'An unexpected error occurred',
        500,
      );
    }

    // Attach CORS headers to all responses
    const cors = corsHeaders(env.FRONTEND_URL, request);
    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value);
    }

    return response;
  },
};

async function route(
  request: Request,
  env: Env,
  pathname: string,
  method: string,
): Promise<Response> {
  // ── Auth routes ──────────────────────────────────────────────────────────
  if (pathname === '/api/login' && method === 'POST') {
    return handleLogin(request, env);
  }
  if (pathname === '/api/logout' && method === 'POST') {
    return handleLogout(request);
  }
  if (pathname === '/api/me' && method === 'GET') {
    return handleMe(request, env);
  }

  // ── Settings routes ──────────────────────────────────────────────────────
  if (pathname === '/api/settings' && method === 'GET') {
    return handleGetSettings(request, env);
  }
  if (pathname === '/api/settings/openrouter-key' && method === 'PUT') {
    return handleUpdateOpenRouterKey(request, env);
  }
  if (pathname === '/api/settings/openrouter-models' && method === 'GET') {
    return handleGetOpenRouterModels(request, env);
  }
  if (pathname === '/api/settings/selected-models' && method === 'PUT') {
    return handleUpdateSelectedModels(request, env);
  }

  // ── Admin routes ─────────────────────────────────────────────────────────
  if (pathname === '/api/admin/users' && method === 'GET') {
    return handleListUsers(request, env);
  }
  if (pathname === '/api/admin/users' && method === 'POST') {
    return handleCreateUser(request, env);
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) {
    const userId = adminUserMatch[1];
    if (method === 'PUT') return handleUpdateUser(request, env, userId);
    if (method === 'DELETE') return handleDeleteUser(request, env, userId);
  }

  // ── Analysis routes ──────────────────────────────────────────────────────
  if (pathname === '/api/analyze' && method === 'POST') {
    return handleAnalyze(request, env);
  }
  if (pathname === '/api/analyses' && method === 'GET') {
    return handleListAnalyses(request, env);
  }

  const analysisMatch = pathname.match(/^\/api\/analyses\/([^/]+)$/);
  if (analysisMatch && method === 'GET') {
    return handleGetAnalysis(request, env, analysisMatch[1]);
  }

  const imageMatch = pathname.match(/^\/api\/images\/([^/]+)$/);
  if (imageMatch && method === 'GET') {
    return handleGetImage(request, env, imageMatch[1]);
  }

  // ── Health check ─────────────────────────────────────────────────────────
  if (pathname === '/api/health' && method === 'GET') {
    return Response.json({ status: 'ok', service: env.APP_NAME });
  }

  return jsonError('NOT_FOUND', 'Route not found', 404);
}
