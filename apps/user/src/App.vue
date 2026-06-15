<script setup lang="ts">
import { onHide, onLaunch, onShow } from "@dcloudio/uni-app";
import { goHome } from "@/utils/navigation";

const HOME_ROUTE = "pages/index/index";
const STARTUP_FALLBACK_DELAY_MS = 200;
let startupFallbackScheduled = false;

onLaunch((options) => {
  console.log("[APP_LAUNCH]", options);
  scheduleStartupRouteFallback();
});

onShow((options) => {
  console.log("[APP_SHOW]", options);
  scheduleStartupRouteFallback();
});

onHide(() => {});

function scheduleStartupRouteFallback(): void {
  if (startupFallbackScheduled) {
    return;
  }

  startupFallbackScheduled = true;
  setTimeout(() => {
    relaunchHomeIfStartupRouteIsInvalid();
  }, STARTUP_FALLBACK_DELAY_MS);
}

function relaunchHomeIfStartupRouteIsInvalid(): void {
  const pages = getCurrentPages();
  if (pages.length === 0) {
    goHome();
    return;
  }

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
