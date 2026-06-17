const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const devApiBaseUrl = import.meta.env.DEV ? "http://localhost:3001/api" : "";

if (!apiBaseUrl && import.meta.env.PROD) {
  throw new Error("Missing VITE_API_BASE_URL. Set it in apps/admin/.env.production before building admin.");
}

export const API_BASE_URL = apiBaseUrl || devApiBaseUrl;
