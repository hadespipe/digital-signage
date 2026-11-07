export interface HealthResponse {
  ok: true;
}

export interface SessionResponse {
  csrfToken: string;
}

export interface LoginRequest {
  password: string;
}

export interface ErrorResponse {
  error: { code: string; message: string };
}

export interface Playlist {
  version: number;
  images: Array<{ id: string; path: string }>;
}
