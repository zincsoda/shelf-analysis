import type { Analysis, AnalysisWithUser } from '@shelf-analysis/shared';
import type { AnalysisRow, Env } from '../types';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { analyzeShelfImage, isAllowedModel } from '../services/openrouter';
import { getUserSelectedModels, resolveOpenRouterApiKey } from '../services/user-settings';
import {
  bufferToBase64,
  getImage,
  MAX_FILE_SIZE,
  storeImage,
  validateImage,
} from '../services/storage';
import { jsonError, jsonSuccess } from '../lib/response';

/** Convert DB row to public Analysis object */
function rowToAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    user_id: row.user_id,
    image_url: `/api/images/${row.id}`,
    model_used: row.model_used as Analysis['model_used'],
    empty_percentage: row.empty_percentage,
    confidence: row.confidence,
    analysis_text: row.analysis_text,
    created_at: row.created_at,
  };
}

/** POST /api/analyze — upload image and run AI analysis */
export async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Expected multipart form data', 400);
  }

  const file = formData.get('image');

  if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
    return jsonError('VALIDATION_ERROR', 'Image file is required', 400);
  }
  const uploadFile = file as File;
  const model = formData.get('model');
  const allowedModels = await getUserSelectedModels(env, auth.user.id);
  if (typeof model !== 'string' || !isAllowedModel(model, allowedModels)) {
    return jsonError('VALIDATION_ERROR', 'Valid AI model selection is required', 400);
  }

  const validation = validateImage(uploadFile);
  if ('error' in validation) {
    return jsonError('VALIDATION_ERROR', validation.error, 400);
  }

  if (uploadFile.size > MAX_FILE_SIZE) {
    return jsonError('VALIDATION_ERROR', 'File too large. Maximum size is 5 MB', 400);
  }

  const bytes = await uploadFile.arrayBuffer();
  const analysisId = crypto.randomUUID();

  // Store image in R2
  const imageKey = await storeImage(env.IMAGES, auth.user.id, analysisId, bytes, validation.mimeType);

  const apiKey = await resolveOpenRouterApiKey(env, auth.user.id);
  if (!apiKey) {
    return jsonError(
      'CONFIG_ERROR',
      'No OpenRouter API key configured. Add your key in Settings.',
      400,
    );
  }

  // Call OpenRouter for analysis
  let aiResult;
  try {
    const base64 = bufferToBase64(bytes);
    aiResult = await analyzeShelfImage(env, apiKey, model, base64, validation.mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI analysis failed';
    return jsonError('AI_ERROR', message, 502);
  }

  // Persist analysis record
  await env.DB.prepare(
    `INSERT INTO analyses (id, user_id, image_url, model_used, empty_percentage, confidence, analysis_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      analysisId,
      auth.user.id,
      imageKey,
      model,
      aiResult.empty_percentage,
      aiResult.confidence,
      aiResult.analysis,
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM analyses WHERE id = ?')
    .bind(analysisId)
    .first<AnalysisRow>();

  return jsonSuccess({ analysis: rowToAnalysis(row!) }, 201);
}

/** GET /api/analyses — list analyses (own for users, all for admins) */
export async function handleListAnalyses(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  if (auth.user.role === 'admin') {
    const { results } = await env.DB.prepare(
      `SELECT a.*, u.email as user_email
       FROM analyses a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC`,
    ).all<AnalysisRow & { user_email: string }>();

    const analyses: AnalysisWithUser[] = results.map((row) => ({
      ...rowToAnalysis(row),
      user_email: row.user_email,
    }));

    return jsonSuccess({ analyses });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(auth.user.id)
    .all<AnalysisRow>();

  return jsonSuccess({ analyses: results.map(rowToAnalysis) });
}

/** GET /api/analyses/:id — get single analysis */
export async function handleGetAnalysis(
  request: Request,
  env: Env,
  analysisId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare('SELECT * FROM analyses WHERE id = ?')
    .bind(analysisId)
    .first<AnalysisRow>();

  if (!row) {
    return jsonError('NOT_FOUND', 'Analysis not found', 404);
  }

  // Users can only view their own analyses
  if (auth.user.role !== 'admin' && row.user_id !== auth.user.id) {
    return jsonError('FORBIDDEN', 'Access denied', 403);
  }

  return jsonSuccess({ analysis: rowToAnalysis(row) });
}

/** GET /api/images/:id — serve image from R2 (authenticated) */
export async function handleGetImage(
  request: Request,
  env: Env,
  analysisId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare('SELECT user_id, image_url FROM analyses WHERE id = ?')
    .bind(analysisId)
    .first<{ user_id: string; image_url: string }>();

  if (!row) {
    return jsonError('NOT_FOUND', 'Image not found', 404);
  }

  if (auth.user.role !== 'admin' && row.user_id !== auth.user.id) {
    return jsonError('FORBIDDEN', 'Access denied', 403);
  }

  const object = await getImage(env.IMAGES, row.image_url);
  if (!object) {
    return jsonError('NOT_FOUND', 'Image file not found in storage', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.body, { headers });
}
