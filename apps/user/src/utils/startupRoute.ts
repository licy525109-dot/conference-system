const HOME_ROUTE = "pages/index/index";
const SPLASH_ROUTE = "pages/splash/index";

export function shouldRelaunchHome(route: string, options: Record<string, unknown>): boolean {
  if (!route) return true;
  if (route === HOME_ROUTE || route === SPLASH_ROUTE) return false;
  if (route === "pages/payment/result") return !hasStringValue(options.orderNo);
  if (route === "pages/conference/detail") return !hasStringValue(options.id) && !hasStringValue(options.conferenceId);
  if (route === "pages/registration/form") return !hasStringValue(options.conferenceId);
  if (route === "pages/mall/detail") return !hasStringValue(options.id);
  if (route === "pages/custom/index") return !hasStringValue(options.pageKey);

  return !route.startsWith("pages/");
}

function hasStringValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
