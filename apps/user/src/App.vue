<script setup lang="ts">
import { onHide, onLaunch, onShow } from "@dcloudio/uni-app";
import { getAppTheme, type ThemeConfig } from "@/services/cms";
import { goHome } from "@/utils/navigation";

const HOME_ROUTE = "pages/index/index";
const SPLASH_ROUTE = "pages/splash/index";
const STARTUP_FALLBACK_DELAY_MS = 500;
const MAX_STARTUP_FALLBACK_ATTEMPTS = 5;
let startupFallbackTimer: ReturnType<typeof setTimeout> | undefined;
let startupFallbackAttempts = 0;
let startupFallbackResolved = false;
let splashOpening = false;

onLaunch((options) => {
  console.log("[APP_LAUNCH]", options);
  scheduleStartupRouteFallback();
});

onShow((options) => {
  console.log("[APP_SHOW]", options);
  scheduleStartupRouteFallback();
});

onHide(() => {
  if (startupFallbackTimer) {
    clearTimeout(startupFallbackTimer);
    startupFallbackTimer = undefined;
  }
});

function scheduleStartupRouteFallback(): void {
  if (startupFallbackResolved || startupFallbackTimer) {
    return;
  }

  startupFallbackTimer = setTimeout(() => {
    startupFallbackTimer = undefined;
    relaunchHomeIfStartupRouteIsInvalid();
  }, STARTUP_FALLBACK_DELAY_MS);
}

function relaunchHomeIfStartupRouteIsInvalid(): void {
  const pages = getCurrentPages();
  if (pages.length === 0) {
    if (startupFallbackAttempts < MAX_STARTUP_FALLBACK_ATTEMPTS) {
      startupFallbackAttempts += 1;
      scheduleStartupRouteFallback();
    }
    return;
  }

  startupFallbackResolved = true;
  const topPage = pages[pages.length - 1] as unknown as { route?: string; options?: Record<string, unknown> };
  const route = normalizeRoute(topPage.route);
  const options = readQuery(topPage.options);

  if (shouldRelaunchHome(route, options)) {
    goHome();
  }
}

function shouldRelaunchHome(route: string, options: Record<string, unknown>): boolean {
  if (!route) {
    return true;
  }

  if (route === HOME_ROUTE) {
    void maybeOpenSplash();
    return false;
  }

  if (route === SPLASH_ROUTE) {
    return false;
  }

  if (route === "pages/payment/result") {
    return !hasStringValue(options.orderNo);
  }

  if (route === "pages/conference/detail") {
    return !hasStringValue(options.id) && !hasStringValue(options.conferenceId);
  }

  if (route === "pages/registration/form") {
    return !hasStringValue(options.conferenceId);
  }

  if (route === "pages/registrations/my") {
    return false;
  }

  if (route === "pages/cart/index") {
    return false;
  }

  if (route === "pages/member/center") {
    return false;
  }

  if (route === "pages/mall/index") {
    return false;
  }

  if (route === "pages/mall/detail") {
    return !hasStringValue(options.id);
  }

  if (route === "pages/custom/index") {
    return !hasStringValue(options.pageKey);
  }

  return true;
}

async function maybeOpenSplash(): Promise<void> {
  if (splashOpening) return;
  splashOpening = true;
  try {
    const theme = await getAppTheme("home");
    if (!shouldShowSplash(theme)) return;
    markSplashShown(theme);
    uni.navigateTo({ url: `/pages/splash/index?redirect=${encodeURIComponent(`/${HOME_ROUTE}`)}` });
  } catch {
    // 启动页是增强体验，主题接口失败时继续进入首页。
  } finally {
    splashOpening = false;
  }
}

function shouldShowSplash(theme: ThemeConfig): boolean {
  if (!theme.splashEnabled) return false;
  if (!hasStringValue(theme.splashVideoUrl) && !hasStringValue(theme.splashPosterUrl)) return false;
  const frequency = String(theme.splashFrequency || "daily");
  if (frequency === "every_time") return true;
  const key = splashStorageKey(theme, frequency);
  return uni.getStorageSync(key) !== splashStorageValue(frequency);
}

function markSplashShown(theme: ThemeConfig): void {
  const frequency = String(theme.splashFrequency || "daily");
  if (frequency === "every_time") return;
  uni.setStorageSync(splashStorageKey(theme, frequency), splashStorageValue(frequency));
}

function splashStorageKey(theme: ThemeConfig, frequency: string): string {
  if (frequency === "version") {
    const versionSeed = [theme.splashVideoUrl, theme.splashPosterUrl, theme.splashCountdownSeconds, theme.splashSkipText].map((value) => String(value || "")).join("|");
    return `conference:splash:version:${hashStorageSeed(versionSeed)}`;
  }
  return "conference:splash:daily";
}

function splashStorageValue(frequency: string): string {
  if (frequency === "version") return "shown";
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function hashStorageSeed(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return String(hash);
}

function readQuery(query: unknown): Record<string, unknown> {
  return typeof query === "object" && query !== null ? (query as Record<string, unknown>) : {};
}

function normalizeRoute(path: string | undefined): string {
  if (!path) {
    return "";
  }
  return path.startsWith("/") ? path.slice(1) : path;
}

function hasStringValue(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
</script>

<style>
@import "./styles/tokens.css";

page {
  min-height: 100%;
  background: var(--ui-color-bg);
  color: var(--ui-color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button {
  margin: 0;
}

button::after {
  border: 0;
}
</style>
