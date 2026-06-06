import { API_BASE_URL } from "../config";

interface ApiEnvelope<T> {
  code?: string;
  message?: string;
  data?: T;
}

const TOKEN_STORAGE_KEY = "conference_admin_token";

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  const token = getAdminToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (response.ok && body.code === "OK") {
    return body.data as T;
  }

  throw new Error(body.message || `请求失败 (${response.status})`);
}

export function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "undefined" && value !== "") {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
