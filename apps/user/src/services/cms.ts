import { request } from "./request";
import type { PageDsl } from "@conference/dsl-runtime";
import { buildCmsCompositionDsl, type CmsCompositionKind } from "@conference/shared";

export interface CmsComponent {
  id: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface PublishedPage {
  id: string;
  pageKey: string;
  title: string;
  description: string | null;
  pageType: string;
  bindingType?: string | null;
  conferenceId?: string | null;
  productId?: string | null;
  version: {
    id: string;
    versionNo: number;
    title: string;
    dsl: PageDsl;
    themeJson: Record<string, unknown> | null;
    publishedAt: string | null;
    updatedAt: string;
  };
}

export interface PageMeta {
  pageTitle: string;
  navLogoUrl: string;
  navLogoDynamicUrl: string;
  shareTitle: string;
  shareDescription: string;
  shareImageUrl: string;
}

export interface AppTheme {
  scope: string;
  themePresetId: string | null;
  config: ThemeConfig;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface ThemeConfig {
  visualPreset?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackground: string;
  radius: number;
  buttonStyle: string;
  shadow: string;
  titleFontSize: number;
  bannerStyle: string;
  backgroundMode?: string;
  backgroundGradientFrom?: string;
  backgroundGradientTo?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  backgroundVideoPosterUrl?: string;
  backgroundVideoOverlayMode?: string;
  backgroundVideoOverlayOpacity?: number;
  backgroundDynamicDensity?: number;
  backgroundDynamicSpeed?: number;
  backgroundDynamicPattern?: string;
  backgroundGradientAngle?: number;
  backgroundBottomFilter?: boolean;
  backgroundApplyTo?: string;
  themeApplyMode?: string;
  themeApplyPageKeys?: string[];
  splashEnabled?: boolean;
  splashVideoUrl?: string;
  splashPosterUrl?: string;
  splashCountdownSeconds?: number;
  splashAllowSkip?: boolean;
  splashSkipText?: string;
  splashFrequency?: string;
  splashShowBottomText?: boolean;
  splashBottomText?: string;
  splashBottomTextStyle?: string;
  [key: string]: string | number | boolean | string[] | null | undefined;
}

export interface AppTabbar {
  enabled: boolean;
  items: TabbarItem[];
  updatedAt: string | null;
}

export interface TabbarItem {
  id: string;
  title: string;
  iconUrl: string | null;
  selectedIconUrl: string | null;
  pageKey: string;
  path: string;
  visible: boolean;
  sortOrder: number;
  requireLogin: boolean;
  badgeText: string | null;
}

export const DEFAULT_THEME: ThemeConfig = {
  visualPreset: "guanchao-premium",
  primaryColor: "#10233d",
  secondaryColor: "#2f7868",
  accentColor: "#a97e38",
  backgroundColor: "#f5f7f5",
  cardBackground: "#ffffff",
  radius: 8,
  buttonStyle: "solid",
  shadow: "soft",
  titleFontSize: 42,
  bannerStyle: "clean",
  backgroundMode: "solid",
  backgroundGradientFrom: "#fbfcfb",
  backgroundGradientTo: "#edf3f0",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  backgroundVideoPosterUrl: "",
  backgroundVideoOverlayMode: "light",
  backgroundVideoOverlayOpacity: 0.08,
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 30,
  backgroundDynamicPattern: "flow",
  backgroundGradientAngle: 135,
  backgroundBottomFilter: true,
  backgroundApplyTo: "body",
  themeApplyMode: "all",
  themeApplyPageKeys: [],
  splashEnabled: false,
  splashVideoUrl: "",
  splashPosterUrl: "",
  splashCountdownSeconds: 5,
  splashAllowSkip: true,
  splashSkipText: "跳过",
  splashFrequency: "daily",
  splashShowBottomText: true,
  splashBottomText: "欢迎进入会务小程序",
  splashBottomTextStyle: "light"
};

export function createDefaultPageDsl(pageKey: string): PageDsl {
  return buildCmsCompositionDsl(defaultCompositionKind(pageKey), pageKey) as PageDsl;
}

function defaultCompositionKind(pageKey: string): CmsCompositionKind {
  const normalized = pageKey.trim().toLowerCase();
  if (normalized === "home") return "home";
  if (normalized.includes("paiqi") || normalized.includes("schedule")) return "schedule";
  if (normalized === "conference-list" || normalized.includes("registration")) return "registration";
  if (normalized.includes("member") || normalized === "my-registrations") return "member-center";
  if (normalized === "mall") return "mall";
  if (normalized.includes("cart")) return "cart";
  return "home";
}

export async function getPublishedPage(pageKey: string, params: { conferenceId?: string; productId?: string } = {}): Promise<PublishedPage | null> {
  try {
    const query = Object.entries(params)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    const cacheKey = query ? `cms-page:${pageKey}:${query}` : `cms-page:${pageKey}`;
    const page = normalizePublishedPage(await request<PublishedPage>(`/pages/${encodeURIComponent(pageKey)}/published${query ? `?${query}` : ""}`, { auth: false }), pageKey);
    uni.setStorageSync(cacheKey, page);
    return page;
  } catch (error) {
    const query = Object.entries(params)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    const scoped = query ? (uni.getStorageSync(`cms-page:${pageKey}:${query}`) as PublishedPage | "") : "";
    const fallback = uni.getStorageSync(`cms-page:${pageKey}`) as PublishedPage | "";
    return normalizePublishedPage(scoped || fallback || null, pageKey);
  }
}

export function normalizePublishedPage(page: PublishedPage | null | undefined, fallbackPageKey: string): PublishedPage | null {
  if (!page) return null;
  const rawDsl = page.version.dsl;
  const dsl: PageDsl = rawDsl?.schemaVersion === "p9" && rawDsl.dsl && Array.isArray(rawDsl.dsl.nodes)
    ? rawDsl
    : { schemaVersion: "p9", page: page.pageKey || fallbackPageKey, dsl: { nodes: [] } };
  return {
    ...page,
    version: {
      ...page.version,
      dsl
    }
  };
}

export function getPageMeta(page: PublishedPage | null | undefined): PageMeta {
  const raw = page?.version.themeJson?.pageMeta;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pageTitle: typeof source.pageTitle === "string" ? source.pageTitle : "",
    navLogoUrl: typeof source.navLogoUrl === "string" ? source.navLogoUrl : "",
    navLogoDynamicUrl: typeof source.navLogoDynamicUrl === "string" ? source.navLogoDynamicUrl : "",
    shareTitle: typeof source.shareTitle === "string" ? source.shareTitle : "",
    shareDescription: typeof source.shareDescription === "string" ? source.shareDescription : "",
    shareImageUrl: typeof source.shareImageUrl === "string" ? source.shareImageUrl : ""
  };
}

export function applyPageTitle(page: PublishedPage | null | undefined, fallbackTitle: string): void {
  const meta = getPageMeta(page);
  uni.setNavigationBarTitle({ title: meta.pageTitle || page?.title || fallbackTitle });
}

export function buildPageShare(page: PublishedPage | null | undefined, path: string, fallbackTitle: string) {
  const meta = getPageMeta(page);
  return {
    title: meta.shareTitle || meta.pageTitle || page?.title || fallbackTitle,
    path,
    ...(meta.shareImageUrl ? { imageUrl: meta.shareImageUrl } : {})
  };
}

export async function getAppTheme(pageKey?: string): Promise<ThemeConfig> {
  try {
    const theme = await request<AppTheme>("/app/theme", { auth: false });
    uni.setStorageSync("cms-theme", theme.config);
    return resolveThemeForPage({ ...DEFAULT_THEME, ...theme.config }, pageKey);
  } catch {
    const cached = uni.getStorageSync("cms-theme") as Partial<ThemeConfig> | "";
    return resolveThemeForPage({ ...DEFAULT_THEME, ...(cached || {}) }, pageKey);
  }
}

export function resolveThemeForPage(theme: ThemeConfig, pageKey?: string): ThemeConfig {
  const mode = theme.themeApplyMode === "selected" ? "selected" : "all";
  const applyKeys = Array.isArray(theme.themeApplyPageKeys) ? theme.themeApplyPageKeys.filter((item) => typeof item === "string" && item.trim()) : [];
  if (mode !== "selected" || !pageKey || applyKeys.includes(pageKey)) {
    return { ...DEFAULT_THEME, ...theme, themeApplyMode: mode, themeApplyPageKeys: applyKeys };
  }

  return {
    ...DEFAULT_THEME,
    adminBrandTitle: theme.adminBrandTitle,
    adminBrandSubtitle: theme.adminBrandSubtitle,
    adminBrandLogoUrl: theme.adminBrandLogoUrl,
    browserTitle: theme.browserTitle,
    browserIconUrl: theme.browserIconUrl,
    themeApplyMode: mode,
    themeApplyPageKeys: applyKeys
  };
}

export async function getAppTabbar(): Promise<AppTabbar> {
  try {
    const tabbar = await request<AppTabbar>("/app/tabbar", { auth: false });
    uni.setStorageSync("cms-tabbar", tabbar);
    return tabbar;
  } catch {
    const cached = uni.getStorageSync("cms-tabbar") as AppTabbar | "";
    return cached || {
      enabled: true,
      updatedAt: null,
      items: [
        {
          id: "home",
          title: "首页",
          pageKey: "home",
          path: "/pages/index/index",
          iconUrl: null,
          selectedIconUrl: null,
          visible: true,
          sortOrder: 0,
          requireLogin: false,
          badgeText: null
        },
        {
          id: "my",
          title: "我的报名",
          pageKey: "my-registrations",
          path: "/pages/registrations/my",
          iconUrl: null,
          selectedIconUrl: null,
          visible: true,
          sortOrder: 10,
          requireLogin: true,
          badgeText: null
        }
      ]
    };
  }
}
