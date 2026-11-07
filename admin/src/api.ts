import type { Playlist, SessionResponse } from "../../shared/contracts";
let csrfToken = "";
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Request failed (${status})`);
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(init.method && init.method !== "GET"
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function getSession() {
  const session = await request<SessionResponse>("/api/auth/session");
  csrfToken = session.csrfToken;
  return session;
}
export async function login(password: string) {
  const session = await request<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  csrfToken = session.csrfToken;
  return session;
}
export async function logout() {
  await request<void>("/api/auth/logout", { method: "POST" });
  csrfToken = "";
}
export const getPlaylist = () => request<Playlist>("/api/playlist");
export function uploadImages(files: File[]) {
  const body = new FormData();
  for (const file of files) body.append("images", file);
  return request<Playlist>("/api/images", { method: "POST", body });
}
export const removeImage = (id: string) =>
  request<Playlist>(`/api/images/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const reorderImages = (ids: string[]) =>
  request<Playlist>("/api/playlist/order", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
