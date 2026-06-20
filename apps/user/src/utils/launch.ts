const HOME_URL = "/pages/index/index";
const SPLASH_URL = "/pages/splash/index";
const LAUNCH_TARGET_STORAGE_KEY = "conference:launch-target";
const LAUNCH_TARGET_MAX_AGE_MS = 30_000;

interface LaunchOptionsLike {
  path?: string;
  query?: Record<string, unknown>;
  scene?: number | string;
}

export interface LaunchTarget {
  url: string;
  scene?: number | string;
  createdAt: number;
}

export function saveLaunchOptions(options: LaunchOptionsLike | undefined): void {
  const target = launchTargetFromOptions(options);
  if (!target) {
    return;
  }
  uni.setStorageSync(LAUNCH_TARGET_STORAGE_KEY, target);
}

export function consumeLaunchTarget(): LaunchTarget | null {
  const target = uni.getStorageSync(LAUNCH_TARGET_STORAGE_KEY) as LaunchTarget | "";
  uni.removeStorageSync(LAUNCH_TARGET_STORAGE_KEY);
  if (!target || typeof target.url !== "string") {
    return null;
  }

  if (Date.now() - Number(target.createdAt || 0) > LAUNCH_TARGET_MAX_AGE_MS) {
    return null;
  }

  return target;
}

export function createSplashRedirectUrl(targetUrl: string): string {
  return `${SPLASH_URL}?redirect=${encodeURIComponent(normalizeTargetUrl(targetUrl))}`;
}

export function resolveSplashRedirect(value: unknown): string {
  const fromQuery = normalizeTargetUrl(decodeQueryValue(value));
  if (fromQuery !== HOME_URL) {
    return fromQuery;
  }

  return consumeLaunchTarget()?.url || HOME_URL;
}

export function normalizeTargetUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return HOME_URL;
  }

  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  if (!prefixed.startsWith("/pages/")) {
    return HOME_URL;
  }

  const [path] = prefixed.split("?");
  if (path === SPLASH_URL) {
    return HOME_URL;
  }

  return prefixed;
}

function launchTargetFromOptions(options: LaunchOptionsLike | undefined): LaunchTarget | null {
  if (!options?.path) {
    return null;
  }

  const launchPath = normalizePagePath(options.path);
  if (!launchPath || launchPath === SPLASH_URL) {
    return null;
  }

  const url = appendQuery(normalizeTargetUrl(options.path), options.query);
  return {
    url,
    scene: options.scene,
    createdAt: Date.now()
  };
}

function normalizePagePath(path: string): string {
  const normalized = normalizeTargetUrl(path);
  return normalized.split("?")[0] || HOME_URL;
}

function appendQuery(path: string, query: Record<string, unknown> | undefined): string {
  const queryString = Object.entries(query || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  if (!queryString) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}${queryString}`;
}

function decodeQueryValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
