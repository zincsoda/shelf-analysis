import type { UserRole } from '@shelf-analysis/shared';

/** Worker environment bindings and secrets */
export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  APP_NAME: string;
}

/** Authenticated user attached to request context */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Database row shape for users table */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  openrouter_api_key_encrypted: string | null;
  selected_models: string | null;
}

/** Database row shape for analyses table */
export interface AnalysisRow {
  id: string;
  user_id: string;
  image_url: string;
  model_used: string;
  empty_percentage: number;
  confidence: number;
  analysis_text: string;
  created_at: string;
}

/** Database row shape for cameras table */
export interface CameraRow {
  id: string;
  user_id: string;
  name: string;
  type: 'virtual' | 'real';
  stream_url: string | null;
  snapshot_key: string | null;
  perceptron_box_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Database row shape for perceptron_boxes table */
export interface PerceptronBoxRow {
  id: string;
  user_id: string;
  name: string;
  device_token_hash: string;
  poll_interval_seconds: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Database row shape for camera_zones table */
export interface CameraZoneRow {
  id: string;
  camera_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

/** Variables stored on request context after auth middleware */
export interface AppVariables {
  user: AuthUser;
}
