/** Supported OpenRouter vision models for shelf analysis */
export const AI_MODELS = [
  'openai/gpt-4.1',
  'google/gemini-2.0-flash-exp',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.2-90b-vision-instruct',
] as const;

export type AiModel = (typeof AI_MODELS)[number];

export type UserRole = 'admin' | 'user';

/** Public user record (no password hash) */
export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  has_openrouter_api_key: boolean;
}

/** User settings (API keys, etc.) */
export interface UserSettings {
  has_openrouter_api_key: boolean;
  openrouter_key_hint: string | null;
  /** True when no personal key is set but a global worker key is available */
  uses_global_openrouter_key: boolean;
}

/** Shelf analysis result stored in D1 */
export interface Analysis {
  id: string;
  user_id: string;
  image_url: string;
  model_used: AiModel;
  empty_percentage: number;
  confidence: number;
  analysis_text: string;
  created_at: string;
}

/** Analysis with optional user email for admin views */
export interface AnalysisWithUser extends Analysis {
  user_email?: string;
}

/** Parsed AI response from OpenRouter */
export interface AiAnalysisResult {
  empty_percentage: number;
  confidence: number;
  analysis: string;
}

/** Standard API success envelope */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Standard API error envelope */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Login request body */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Create user request (admin) */
export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
}

/** Update user request (admin) */
export interface UpdateUserRequest {
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

/** Auth session returned from /api/me */
export interface AuthSession {
  user: User;
}

/** Update OpenRouter API key (null or empty string to remove) */
export interface UpdateOpenRouterKeyRequest {
  openrouter_api_key: string | null;
}
