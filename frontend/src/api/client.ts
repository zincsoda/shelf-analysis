import type {
  Analysis,
  AnalysisWithUser,
  ApiResponse,
  AuthSession,
  Camera,
  CameraWithZones,
  CameraZone,
  CreateCameraRequest,
  CreateUserRequest,
  CreateZoneRequest,
  LoginRequest,
  OpenRouterModel,
  PerceptronBox,
  PerceptronBoxWithToken,
  CreatePerceptronBoxRequest,
  UpdatePerceptronBoxRequest,
  UpdateCameraRequest,
  UpdateOpenRouterKeyRequest,
  UpdateSelectedModelsRequest,
  UpdateUserRequest,
  User,
  UserSettings,
} from '@shelf-analysis/shared';
import { AI_MODELS } from '@shelf-analysis/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
      });
    } catch {
      throw new ApiError(
        'NETWORK_ERROR',
        'Could not reach the API. Make sure the worker is running (npm run dev).',
        0,
      );
    }

    let data: ApiResponse<T>;
    try {
      data = (await response.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError(
        'PARSE_ERROR',
        `Unexpected response from server (HTTP ${response.status}). Is the API running?`,
        response.status,
      );
    }

    if (!data.success) {
      throw new ApiError(
        data.error?.code ?? 'REQUEST_FAILED',
        data.error?.message ?? `Request failed (HTTP ${response.status})`,
        response.status,
      );
    }

    return data.data;
  }

  login(body: LoginRequest) {
    return this.request<AuthSession>('/api/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  logout() {
    return this.request<{ message: string }>('/api/logout', { method: 'POST' });
  }

  me() {
    return this.request<AuthSession>('/api/me');
  }

  getSettings() {
    return this.request<{ settings: UserSettings }>('/api/settings');
  }

  updateOpenRouterKey(openrouter_api_key: string | null) {
    const body: UpdateOpenRouterKeyRequest = { openrouter_api_key };
    return this.request<{ settings: UserSettings; user: User }>('/api/settings/openrouter-key', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  getOpenRouterModels() {
    return this.request<{ models: OpenRouterModel[] }>('/api/settings/openrouter-models');
  }

  updateSelectedModels(selected_models: string[]) {
    const body: UpdateSelectedModelsRequest = { selected_models };
    return this.request<{ settings: UserSettings }>('/api/settings/selected-models', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  analyze(image: File, model: string) {
    const form = new FormData();
    form.append('image', image);
    form.append('model', model);
    return this.request<{ analysis: Analysis }>('/api/analyze', {
      method: 'POST',
      body: form,
    });
  }

  listAnalyses() {
    return this.request<{ analyses: Analysis[] | AnalysisWithUser[] }>('/api/analyses');
  }

  getAnalysis(id: string) {
    return this.request<{ analysis: Analysis }>(`/api/analyses/${id}`);
  }

  listUsers() {
    return this.request<{ users: User[] }>('/api/admin/users');
  }

  createUser(body: CreateUserRequest) {
    return this.request<{ user: User }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateUser(id: string, body: UpdateUserRequest) {
    return this.request<{ user: User }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteUser(id: string) {
    return this.request<{ message: string }>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  imageUrl(analysisId: string) {
    return `${API_BASE}/api/images/${analysisId}`;
  }

  listCameras() {
    return this.request<{ cameras: Camera[] }>('/api/cameras');
  }

  createCamera(body: CreateCameraRequest) {
    return this.request<{ camera: Camera }>('/api/cameras', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getCamera(id: string) {
    return this.request<{ camera: CameraWithZones }>(`/api/cameras/${id}`);
  }

  updateCamera(id: string, body: UpdateCameraRequest) {
    return this.request<{ camera: Camera }>(`/api/cameras/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteCamera(id: string) {
    return this.request<{ message: string }>(`/api/cameras/${id}`, {
      method: 'DELETE',
    });
  }

  uploadCameraSnapshot(cameraId: string, image: File) {
    const form = new FormData();
    form.append('image', image);
    return this.request<{ camera: Camera }>(`/api/cameras/${cameraId}/snapshot`, {
      method: 'POST',
      body: form,
    });
  }

  createZone(cameraId: string, body: CreateZoneRequest) {
    return this.request<{ zone: CameraZone }>(`/api/cameras/${cameraId}/zones`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  deleteZone(cameraId: string, zoneId: string) {
    return this.request<{ message: string }>(`/api/cameras/${cameraId}/zones/${zoneId}`, {
      method: 'DELETE',
    });
  }

  cameraPreviewUrl(cameraId: string) {
    return `${API_BASE}/api/cameras/${cameraId}/preview`;
  }

  listPerceptronBoxes() {
    return this.request<{ boxes: PerceptronBox[] }>('/api/perceptron-boxes');
  }

  createPerceptronBox(body: CreatePerceptronBoxRequest) {
    return this.request<{ box: PerceptronBoxWithToken }>('/api/perceptron-boxes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updatePerceptronBox(id: string, body: UpdatePerceptronBoxRequest) {
    return this.request<{ box: PerceptronBox }>(`/api/perceptron-boxes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deletePerceptronBox(id: string) {
    return this.request<{ message: string }>(`/api/perceptron-boxes/${id}`, {
      method: 'DELETE',
    });
  }

  regenerateDeviceToken(id: string) {
    return this.request<{ box: PerceptronBoxWithToken }>(
      `/api/perceptron-boxes/${id}/regenerate-token`,
      { method: 'POST' },
    );
  }

  async fetchCameraPreview(cameraId: string): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(this.cameraPreviewUrl(cameraId), { credentials: 'include' });
    } catch {
      throw new ApiError(
        'NETWORK_ERROR',
        'Could not reach the API. Make sure the worker is running (npm run dev).',
        0,
      );
    }

    if (!response.ok) {
      throw new ApiError('PREVIEW_FAILED', `Failed to load camera preview (HTTP ${response.status})`, response.status);
    }

    return response.blob();
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
export { AI_MODELS };
