import type { CurrentUser } from "./auth";

const TOKEN_STORAGE_KEY = "conference_user_token";
const USER_STORAGE_KEY = "conference_user_profile";

export function getToken(): string {
  return String(uni.getStorageSync(TOKEN_STORAGE_KEY) || "");
}

export function setAuthSession(token: string, user: CurrentUser): void {
  uni.setStorageSync(TOKEN_STORAGE_KEY, token);
  uni.setStorageSync(USER_STORAGE_KEY, user);
}

export function getStoredUser(): CurrentUser | null {
  const user = uni.getStorageSync(USER_STORAGE_KEY);
  return user && typeof user === "object" ? (user as CurrentUser) : null;
}
