/** Default vision models when the user has not configured a selection */
export const AI_MODELS = [
  'openai/gpt-4.1',
  'google/gemini-2.5-flash',
  'anthropic/claude-sonnet-4',
  'meta-llama/llama-3.2-11b-vision-instruct',
] as const;

export type AiModel = (typeof AI_MODELS)[number];

/** OpenRouter model metadata (subset returned by our API) */
export interface OpenRouterModel {
  id: string;
  name: string;
  description: string | null;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

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
  /** Models available in the analysis dropdown */
  selected_models: string[];
}

/** Shelf analysis result stored in D1 */
export interface Analysis {
  id: string;
  user_id: string;
  image_url: string;
  model_used: string;
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

/** Update the models shown in the analysis dropdown */
export interface UpdateSelectedModelsRequest {
  selected_models: string[];
}

export type CameraType = 'virtual' | 'real';

/** Edge device that polls local IP cameras and uploads snapshots */
export interface PerceptronBox {
  id: string;
  user_id: string;
  name: string;
  poll_interval_seconds: number;
  camera_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Perceptron Box returned once when created or when the device token is regenerated */
export interface PerceptronBoxWithToken extends PerceptronBox {
  device_token: string;
}

/** IP camera configuration */
export interface Camera {
  id: string;
  user_id: string;
  name: string;
  type: CameraType;
  stream_url: string | null;
  perceptron_box_id: string | null;
  perceptron_box_name: string | null;
  has_snapshot: boolean;
  zone_count: number;
  created_at: string;
  updated_at: string;
}

/** Detection zone on a camera view (normalized 0–1 coordinates) */
export interface CameraZone {
  id: string;
  camera_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

/** Camera with its zones loaded */
export interface CameraWithZones extends Camera {
  zones: CameraZone[];
}

export interface CreatePerceptronBoxRequest {
  name: string;
  poll_interval_seconds?: number;
}

export interface UpdatePerceptronBoxRequest {
  name?: string;
  poll_interval_seconds?: number;
}

/** Camera config pushed to a Perceptron Box for local snapshot polling */
export interface DeviceCameraConfig {
  id: string;
  name: string;
  stream_url: string;
}

/** Full config a Perceptron Box pulls on startup and periodically */
export interface DeviceConfig {
  box: {
    id: string;
    name: string;
    poll_interval_seconds: number;
  };
  cameras: DeviceCameraConfig[];
}

export interface CreateCameraRequest {
  name: string;
  type: CameraType;
  stream_url?: string | null;
  perceptron_box_id?: string | null;
}

export interface UpdateCameraRequest {
  name?: string;
  stream_url?: string | null;
  perceptron_box_id?: string | null;
}

export interface CreateZoneRequest {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UpdateZoneRequest {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
