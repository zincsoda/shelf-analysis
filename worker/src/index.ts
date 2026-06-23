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
import {
  handleCreateCamera,
  handleCreateZone,
  handleDeleteCamera,
  handleDeleteZone,
  handleGetCamera,
  handleGetCameraPreview,
  handleListCameras,
  handleUpdateCamera,
  handleUpdateZone,
  handleUploadCameraSnapshot,
} from './routes/cameras';
import {
  handleCreatePerceptronBox,
  handleDeletePerceptronBox,
  handleGetPerceptronBox,
  handleListPerceptronBoxes,
  handleRegenerateDeviceToken,
  handleUpdatePerceptronBox,
} from './routes/perceptron-boxes';
import { handleDeviceConfig, handleDeviceUploadSnapshot } from './routes/device';

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

  // ── Camera routes ────────────────────────────────────────────────────────
  if (pathname === '/api/cameras' && method === 'GET') {
    return handleListCameras(request, env);
  }
  if (pathname === '/api/cameras' && method === 'POST') {
    return handleCreateCamera(request, env);
  }

  const cameraMatch = pathname.match(/^\/api\/cameras\/([^/]+)$/);
  if (cameraMatch) {
    const cameraId = cameraMatch[1];
    if (method === 'GET') return handleGetCamera(request, env, cameraId);
    if (method === 'PUT') return handleUpdateCamera(request, env, cameraId);
    if (method === 'DELETE') return handleDeleteCamera(request, env, cameraId);
  }

  const cameraPreviewMatch = pathname.match(/^\/api\/cameras\/([^/]+)\/preview$/);
  if (cameraPreviewMatch && method === 'GET') {
    return handleGetCameraPreview(request, env, cameraPreviewMatch[1]);
  }

  const cameraSnapshotMatch = pathname.match(/^\/api\/cameras\/([^/]+)\/snapshot$/);
  if (cameraSnapshotMatch && method === 'POST') {
    return handleUploadCameraSnapshot(request, env, cameraSnapshotMatch[1]);
  }

  const cameraZoneMatch = pathname.match(/^\/api\/cameras\/([^/]+)\/zones$/);
  if (cameraZoneMatch && method === 'POST') {
    return handleCreateZone(request, env, cameraZoneMatch[1]);
  }

  const zoneMatch = pathname.match(/^\/api\/cameras\/([^/]+)\/zones\/([^/]+)$/);
  if (zoneMatch) {
    const [, cameraId, zoneId] = zoneMatch;
    if (method === 'PUT') return handleUpdateZone(request, env, cameraId, zoneId);
    if (method === 'DELETE') return handleDeleteZone(request, env, cameraId, zoneId);
  }

  // ── Perceptron Box routes ────────────────────────────────────────────────
  if (pathname === '/api/perceptron-boxes' && method === 'GET') {
    return handleListPerceptronBoxes(request, env);
  }
  if (pathname === '/api/perceptron-boxes' && method === 'POST') {
    return handleCreatePerceptronBox(request, env);
  }

  const perceptronBoxMatch = pathname.match(/^\/api\/perceptron-boxes\/([^/]+)$/);
  if (perceptronBoxMatch) {
    const boxId = perceptronBoxMatch[1];
    if (method === 'GET') return handleGetPerceptronBox(request, env, boxId);
    if (method === 'PUT') return handleUpdatePerceptronBox(request, env, boxId);
    if (method === 'DELETE') return handleDeletePerceptronBox(request, env, boxId);
  }

  const regenerateTokenMatch = pathname.match(
    /^\/api\/perceptron-boxes\/([^/]+)\/regenerate-token$/,
  );
  if (regenerateTokenMatch && method === 'POST') {
    return handleRegenerateDeviceToken(request, env, regenerateTokenMatch[1]);
  }

  // ── Device routes (Perceptron Box edge agent) ────────────────────────────
  if (pathname === '/api/device/config' && method === 'GET') {
    return handleDeviceConfig(request, env);
  }

  const deviceSnapshotMatch = pathname.match(/^\/api\/device\/cameras\/([^/]+)\/snapshot$/);
  if (deviceSnapshotMatch && method === 'POST') {
    return handleDeviceUploadSnapshot(request, env, deviceSnapshotMatch[1]);
  }

  // ── Health check ─────────────────────────────────────────────────────────
  if (pathname === '/api/health' && method === 'GET') {
    return Response.json({ status: 'ok', service: env.APP_NAME });
  }

  return jsonError('NOT_FOUND', 'Route not found', 404);
}
