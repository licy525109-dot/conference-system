import type { ThemeConfig } from "@/services/cms";

export type CmsThemePresetId = "business-blue" | "tech-black-gold" | "fresh-green" | "summit-red" | "education-vitality";

export interface CmsResolvedTheme {
  id: CmsThemePresetId;
  name: string;
  dark: boolean;
  colors: {
    pageBg: string;
    pageBgSoft: string;
    surface: string;
    surfaceSoft: string;
    surfaceMuted: string;
    surfaceElevated: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textInverse: string;
    primary: string;
    primaryStrong: string;
    primarySoft: string;
    secondary: string;
    secondarySoft: string;
    accent: string;
    accentSoft: string;
    border: string;
    divider: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    info: string;
    infoSoft: string;
    overlay: string;
  };
  gradients: {
    page: string;
    hero: string;
    card: string;
    cta: string;
    soft: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    full: number;
  };
  spacing: {
    pageX: number;
    sectionY: number;
    cardGap: number;
    cardPadding: number;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
    floating: string;
    glow: string;
  };
}

export const CMS_THEME_PRESETS: Record<CmsThemePresetId, CmsResolvedTheme> = {
  "business-blue": {
    id: "business-blue",
    name: "Conference Calm",
    dark: false,
    colors: {
      pageBg: "#F5F7F6",
      pageBgSoft: "#EDF3F0",
      surface: "#FFFFFF",
      surfaceSoft: "#F8FAF8",
      surfaceMuted: "#EEF4F0",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#17202F",
      textSecondary: "#667085",
      textTertiary: "#93A0B2",
      textInverse: "#FFFFFF",
      primary: "#315D7D",
      primaryStrong: "#244861",
      primarySoft: "#E7F0F5",
      secondary: "#3A8F79",
      secondarySoft: "#E3F2EE",
      accent: "#B58B47",
      accentSoft: "#F8EFDF",
      border: "#DDE7EE",
      divider: "#EDF2F4",
      success: "#1F7A5B",
      successSoft: "#E6F3EE",
      warning: "#A56B1F",
      warningSoft: "#FBF1DF",
      danger: "#B93838",
      dangerSoft: "#F9E8E8",
      info: "#315D7D",
      infoSoft: "#E7F0F5",
      overlay: "rgba(23, 32, 47, 0.42)"
    },
    gradients: {
      page: "linear-gradient(180deg, #FBFCFB 0%, #EDF3F0 100%)",
      hero: "linear-gradient(135deg, #244861 0%, #3A8F79 58%, #B58B47 140%)",
      card: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,248,0.97))",
      cta: "linear-gradient(135deg, #315D7D 0%, #3A8F79 100%)",
      soft: "linear-gradient(135deg, #E7F0F5 0%, #F8EFDF 100%)"
    },
    radius: { sm: 8, md: 10, lg: 12, xl: 14, xxl: 18, full: 999 },
    spacing: { pageX: 28, sectionY: 24, cardGap: 16, cardPadding: 24 },
    shadow: {
      sm: "0 6rpx 18rpx rgba(23, 32, 47, 0.05)",
      md: "0 14rpx 34rpx rgba(23, 32, 47, 0.07)",
      lg: "0 24rpx 56rpx rgba(23, 32, 47, 0.1)",
      floating: "0 -10rpx 30rpx rgba(23, 32, 47, 0.12)",
      glow: "0 0 0 rgba(0,0,0,0)"
    }
  },
  "tech-black-gold": {
    id: "tech-black-gold",
    name: "Tech Black Gold",
    dark: true,
    colors: {
      pageBg: "#090B10",
      pageBgSoft: "#111722",
      surface: "rgba(255,255,255,0.08)",
      surfaceSoft: "rgba(255,255,255,0.06)",
      surfaceMuted: "rgba(255,255,255,0.1)",
      surfaceElevated: "rgba(255,255,255,0.12)",
      textPrimary: "#F9FAFB",
      textSecondary: "#AAB2C0",
      textTertiary: "#768194",
      textInverse: "#090B10",
      primary: "#D6B56D",
      primaryStrong: "#F2D68D",
      primarySoft: "rgba(214,181,109,0.16)",
      secondary: "#6CA8FF",
      secondarySoft: "rgba(108,168,255,0.16)",
      accent: "#B88CFF",
      accentSoft: "rgba(184,140,255,0.16)",
      border: "rgba(255,255,255,0.14)",
      divider: "rgba(255,255,255,0.1)",
      success: "#6EE7B7",
      successSoft: "rgba(110,231,183,0.16)",
      warning: "#FACC15",
      warningSoft: "rgba(250,204,21,0.16)",
      danger: "#F87171",
      dangerSoft: "rgba(248,113,113,0.16)",
      info: "#93C5FD",
      infoSoft: "rgba(147,197,253,0.16)",
      overlay: "rgba(0,0,0,0.58)"
    },
    gradients: {
      page: "linear-gradient(180deg, #090B10 0%, #121722 100%)",
      hero: "linear-gradient(135deg, #090B10 0%, #1E293B 52%, #D6B56D 150%)",
      card: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
      cta: "linear-gradient(135deg, #D6B56D 0%, #6CA8FF 100%)",
      soft: "linear-gradient(135deg, rgba(214,181,109,0.14), rgba(108,168,255,0.1))"
    },
    radius: { sm: 12, md: 16, lg: 22, xl: 28, xxl: 34, full: 999 },
    spacing: { pageX: 28, sectionY: 32, cardGap: 20, cardPadding: 30 },
    shadow: {
      sm: "0 10rpx 28rpx rgba(0,0,0,0.22)",
      md: "0 22rpx 54rpx rgba(0,0,0,0.28)",
      lg: "0 36rpx 90rpx rgba(0,0,0,0.36)",
      floating: "0 -12rpx 48rpx rgba(0,0,0,0.34)",
      glow: "0 0 50rpx rgba(214,181,109,0.18)"
    }
  },
  "fresh-green": {
    id: "fresh-green",
    name: "Fresh Green",
    dark: false,
    colors: {
      pageBg: "#F4F5EC",
      pageBgSoft: "#EEF2E5",
      surface: "#FFFFFF",
      surfaceSoft: "#FAFBF5",
      surfaceMuted: "#EEF2E5",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#18201A",
      textSecondary: "#687266",
      textTertiary: "#8E9A89",
      textInverse: "#FFFFFF",
      primary: "#263B2E",
      primaryStrong: "#18261E",
      primarySoft: "#E4ECDD",
      secondary: "#86A36E",
      secondarySoft: "#EEF4E8",
      accent: "#B68E55",
      accentSoft: "#F8EEDC",
      border: "#E1E6D8",
      divider: "#E9EDE2",
      success: "#327A4E",
      successSoft: "#E4F3E8",
      warning: "#A66A2A",
      warningSoft: "#FBF0DF",
      danger: "#B4534A",
      dangerSoft: "#FBEAE8",
      info: "#597D76",
      infoSoft: "#E5F0ED",
      overlay: "rgba(24, 32, 26, 0.36)"
    },
    gradients: {
      page: "linear-gradient(180deg, #F7F8F0 0%, #EEF2E5 100%)",
      hero: "linear-gradient(135deg, #263B2E 0%, #86A36E 100%)",
      card: "linear-gradient(180deg, #FFFFFF 0%, #FAFBF5 100%)",
      cta: "linear-gradient(135deg, #263B2E 0%, #86A36E 100%)",
      soft: "linear-gradient(135deg, #E4ECDD 0%, #F8F1E6 100%)"
    },
    radius: { sm: 14, md: 18, lg: 24, xl: 30, xxl: 36, full: 999 },
    spacing: { pageX: 28, sectionY: 30, cardGap: 18, cardPadding: 30 },
    shadow: {
      sm: "0 8rpx 20rpx rgba(38, 59, 46, 0.05)",
      md: "0 18rpx 44rpx rgba(38, 59, 46, 0.08)",
      lg: "0 28rpx 74rpx rgba(38, 59, 46, 0.12)",
      floating: "0 -10rpx 34rpx rgba(38, 59, 46, 0.12)",
      glow: "0 0 0 rgba(0,0,0,0)"
    }
  },
  "summit-red": {
    id: "summit-red",
    name: "Summit Red",
    dark: false,
    colors: {
      pageBg: "#FFF8F3",
      pageBgSoft: "#FBEDE5",
      surface: "#FFFFFF",
      surfaceSoft: "#FFFDFC",
      surfaceMuted: "#FFF1EA",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#231815",
      textSecondary: "#7A6560",
      textTertiary: "#A9928C",
      textInverse: "#FFFFFF",
      primary: "#B4232A",
      primaryStrong: "#8F151C",
      primarySoft: "#FBE7E8",
      secondary: "#C78B37",
      secondarySoft: "#FBF0DB",
      accent: "#D8582F",
      accentSoft: "#FCEAE3",
      border: "#F0DDD6",
      divider: "#F5E6DF",
      success: "#277A4F",
      successSoft: "#E7F4EC",
      warning: "#B76E00",
      warningSoft: "#FFF4DA",
      danger: "#B4232A",
      dangerSoft: "#FBE7E8",
      info: "#8A4D2B",
      infoSoft: "#FBEDE5",
      overlay: "rgba(35, 24, 21, 0.42)"
    },
    gradients: {
      page: "linear-gradient(180deg, #FFF8F3 0%, #FBEDE5 100%)",
      hero: "linear-gradient(135deg, #B4232A 0%, #C78B37 100%)",
      card: "linear-gradient(180deg, #FFFFFF 0%, #FFFDFC 100%)",
      cta: "linear-gradient(135deg, #B4232A 0%, #C78B37 100%)",
      soft: "linear-gradient(135deg, #FBE7E8 0%, #FBF0DB 100%)"
    },
    radius: { sm: 10, md: 14, lg: 20, xl: 26, xxl: 32, full: 999 },
    spacing: { pageX: 28, sectionY: 30, cardGap: 18, cardPadding: 28 },
    shadow: {
      sm: "0 8rpx 20rpx rgba(180, 35, 42, 0.05)",
      md: "0 18rpx 44rpx rgba(180, 35, 42, 0.09)",
      lg: "0 28rpx 74rpx rgba(180, 35, 42, 0.14)",
      floating: "0 -10rpx 34rpx rgba(180, 35, 42, 0.13)",
      glow: "0 0 0 rgba(0,0,0,0)"
    }
  },
  "education-vitality": {
    id: "education-vitality",
    name: "Education Vitality",
    dark: false,
    colors: {
      pageBg: "#F7FAFF",
      pageBgSoft: "#EEF6FF",
      surface: "#FFFFFF",
      surfaceSoft: "#F9FBFF",
      surfaceMuted: "#EEF6FF",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#111827",
      textSecondary: "#6B7280",
      textTertiary: "#9CA3AF",
      textInverse: "#FFFFFF",
      primary: "#3B82F6",
      primaryStrong: "#2563EB",
      primarySoft: "#E8F1FF",
      secondary: "#22C55E",
      secondarySoft: "#E9FBEF",
      accent: "#F59E0B",
      accentSoft: "#FFF2D9",
      border: "#E5E7EB",
      divider: "#EEF2F7",
      success: "#16A34A",
      successSoft: "#E9FBEF",
      warning: "#D97706",
      warningSoft: "#FFF2D9",
      danger: "#DC2626",
      dangerSoft: "#FEE2E2",
      info: "#2563EB",
      infoSoft: "#E8F1FF",
      overlay: "rgba(17, 24, 39, 0.36)"
    },
    gradients: {
      page: "linear-gradient(180deg, #F7FAFF 0%, #EEF6FF 100%)",
      hero: "linear-gradient(135deg, #3B82F6 0%, #22C55E 100%)",
      card: "linear-gradient(180deg, #FFFFFF 0%, #F9FBFF 100%)",
      cta: "linear-gradient(135deg, #3B82F6 0%, #F59E0B 100%)",
      soft: "linear-gradient(135deg, #E8F1FF 0%, #E9FBEF 100%)"
    },
    radius: { sm: 14, md: 18, lg: 24, xl: 30, xxl: 36, full: 999 },
    spacing: { pageX: 28, sectionY: 28, cardGap: 18, cardPadding: 28 },
    shadow: {
      sm: "0 8rpx 20rpx rgba(37, 99, 235, 0.05)",
      md: "0 18rpx 44rpx rgba(37, 99, 235, 0.08)",
      lg: "0 28rpx 74rpx rgba(37, 99, 235, 0.12)",
      floating: "0 -10rpx 34rpx rgba(37, 99, 235, 0.12)",
      glow: "0 0 0 rgba(0,0,0,0)"
    }
  }
};

export function resolveCmsTheme(config: ThemeConfig): CmsResolvedTheme {
  const presetId = normalizePresetId(config.visualPreset);
  const preset = CMS_THEME_PRESETS[presetId];
  const radius = Number(config.radius) || preset.radius.md;
  const pageBg = config.backgroundColor || preset.colors.pageBg;
  const primary = config.primaryColor || preset.colors.primary;
  const secondary = config.secondaryColor || preset.colors.secondary;
  const accent = config.accentColor || preset.colors.accent;
  const surface = config.cardBackground || preset.colors.surface;
  return {
    ...preset,
    colors: {
      ...preset.colors,
      pageBg,
      surface,
      surfaceElevated: surface,
      primary,
      primaryStrong: darkenFallback(primary, preset.colors.primaryStrong),
      secondary,
      accent
    },
    gradients: {
      ...preset.gradients,
      page: `linear-gradient(180deg, ${pageBg} 0%, ${preset.colors.pageBgSoft} 100%)`,
      hero: `linear-gradient(135deg, ${primary} 0%, ${secondary} 62%, ${accent} 140%)`,
      cta: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
    },
    radius: {
      sm: Math.max(6, radius),
      md: Math.max(8, radius + 4),
      lg: Math.max(12, radius + 10),
      xl: Math.max(16, radius + 16),
      xxl: Math.max(20, radius + 22),
      full: 999
    }
  };
}

export function createCmsThemeVars(config: ThemeConfig): Record<string, string> {
  const theme = resolveCmsTheme(config);
  return {
    "--cms-page-bg": theme.colors.pageBg,
    "--cms-page-bg-soft": theme.colors.pageBgSoft,
    "--cms-bg": theme.colors.pageBg,
    "--cms-surface": theme.colors.surface,
    "--cms-card": theme.colors.surface,
    "--cms-surface-soft": theme.colors.surfaceSoft,
    "--cms-surface-muted": theme.colors.surfaceMuted,
    "--cms-surface-elevated": theme.colors.surfaceElevated,
    "--cms-text-primary": theme.colors.textPrimary,
    "--cms-text-secondary": theme.colors.textSecondary,
    "--cms-text-tertiary": theme.colors.textTertiary,
    "--cms-text-inverse": theme.colors.textInverse,
    "--cms-primary": theme.colors.primary,
    "--cms-primary-strong": theme.colors.primaryStrong,
    "--cms-primary-soft": theme.colors.primarySoft,
    "--cms-secondary": theme.colors.secondary,
    "--cms-secondary-soft": theme.colors.secondarySoft,
    "--cms-accent": theme.colors.accent,
    "--cms-accent-soft": theme.colors.accentSoft,
    "--cms-border": theme.colors.border,
    "--cms-divider": theme.colors.divider,
    "--cms-success": theme.colors.success,
    "--cms-success-soft": theme.colors.successSoft,
    "--cms-warning": theme.colors.warning,
    "--cms-warning-soft": theme.colors.warningSoft,
    "--cms-danger": theme.colors.danger,
    "--cms-danger-soft": theme.colors.dangerSoft,
    "--cms-info": theme.colors.info,
    "--cms-info-soft": theme.colors.infoSoft,
    "--cms-overlay": theme.colors.overlay,
    "--cms-gradient-page": theme.gradients.page,
    "--cms-gradient-hero": theme.gradients.hero,
    "--cms-gradient-card": theme.gradients.card,
    "--cms-gradient-cta": theme.gradients.cta,
    "--cms-gradient-soft": theme.gradients.soft,
    "--cms-radius-sm": `${theme.radius.sm}px`,
    "--cms-radius": `${theme.radius.md}px`,
    "--cms-radius-md": `${theme.radius.md}px`,
    "--cms-radius-lg": `${theme.radius.lg}px`,
    "--cms-radius-xl": `${theme.radius.xl}px`,
    "--cms-radius-xxl": `${theme.radius.xxl}px`,
    "--cms-radius-full": `${theme.radius.full}px`,
    "--cms-space-page-x": `${theme.spacing.pageX}rpx`,
    "--cms-space-section-y": `${theme.spacing.sectionY}rpx`,
    "--cms-space-card-gap": `${theme.spacing.cardGap}rpx`,
    "--cms-space-card-padding": `${theme.spacing.cardPadding}rpx`,
    "--cms-shadow-sm": theme.shadow.sm,
    "--cms-shadow-md": theme.shadow.md,
    "--cms-shadow-lg": theme.shadow.lg,
    "--cms-shadow-floating": theme.shadow.floating,
    "--cms-shadow-glow": theme.shadow.glow,
    "--cms-title-size": `${Number(config.titleFontSize) || 42}rpx`,
    "--ui-color-bg": theme.colors.pageBg,
    "--ui-color-bg-soft": theme.colors.pageBgSoft,
    "--ui-color-surface": theme.colors.surface,
    "--ui-color-surface-muted": theme.colors.surfaceMuted,
    "--ui-color-primary": theme.colors.primary,
    "--ui-color-primary-strong": theme.colors.primaryStrong,
    "--ui-color-primary-soft": theme.colors.primarySoft,
    "--ui-color-accent": theme.colors.accent,
    "--ui-color-warning": theme.colors.warning,
    "--ui-color-danger": theme.colors.danger,
    "--ui-color-success": theme.colors.success,
    "--ui-color-text": theme.colors.textPrimary,
    "--ui-color-muted": theme.colors.textSecondary,
    "--ui-color-subtle": theme.colors.textTertiary,
    "--ui-color-border": theme.colors.border,
    "--ui-radius-sm": `${theme.radius.sm}px`,
    "--ui-radius": `${theme.radius.md}px`,
    "--ui-shadow-card": theme.shadow.md,
    "--ui-shadow-bottom": theme.shadow.floating,
    "--cms-video-overlay-opacity": String(resolveVideoOverlayOpacity(config))
  };
}

function resolveVideoOverlayOpacity(config: ThemeConfig): number {
  const mode = String(config.backgroundVideoOverlayMode || "light");
  if (mode === "none") return 0;
  if (mode === "medium") return 0.22;
  if (mode === "strong") return 0.38;
  if (mode === "custom") return Math.max(0, Math.min(0.7, Number(config.backgroundVideoOverlayOpacity) || 0));
  return 0.08;
}

export function createCmsBackgroundStyle(config: ThemeConfig, target: "body" | "header"): Record<string, string> {
  const theme = resolveCmsTheme(config);
  if (target === "body" && config.backgroundApplyTo === "header") return {};
  if (target === "header" && config.backgroundApplyTo !== "header") return {};

  if (config.backgroundMode === "video") {
    if (config.backgroundVideoPosterUrl) {
      return {
        backgroundImage: `url("${config.backgroundVideoPosterUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      };
    }
    return { background: "transparent" };
  }

  if (config.backgroundMode === "image" && config.backgroundImageUrl) {
    const overlay = config.backgroundBottomFilter === false
      ? ""
      : `linear-gradient(180deg, rgba(255,255,255,0.10), ${theme.colors.pageBg} 96%), `;
    return {
      backgroundImage: `${overlay}url("${config.backgroundImageUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center top",
      backgroundRepeat: "no-repeat"
    };
  }

  if (config.backgroundMode === "dynamic-gradient") {
    return {
      backgroundImage: dynamicGradientBackground(config),
      backgroundSize: "240% 240%",
      backgroundPosition: "center top"
    };
  }

  if (config.backgroundMode === "gradient") {
    return {
      backgroundImage: `linear-gradient(180deg, ${config.backgroundGradientFrom || theme.colors.pageBg}, ${config.backgroundGradientTo || theme.colors.pageBgSoft})`
    };
  }

  return { background: config.backgroundColor || theme.colors.pageBg };
}

export function dynamicGradientBackground(config: ThemeConfig): string {
  const theme = resolveCmsTheme(config);
  const from = config.backgroundGradientFrom || theme.colors.pageBg;
  const to = config.backgroundGradientTo || theme.colors.secondarySoft;
  const density = Math.max(10, Math.min(100, Number(config.backgroundDynamicDensity) || 44));
  const scale = Math.max(44, Math.round(density / 1.05));
  const overlay = config.backgroundBottomFilter === false
    ? ""
    : `linear-gradient(180deg, rgba(255,255,255,0.02), ${alpha(theme.colors.pageBg, 0.58)} 118%), `;
  const pattern = String(config.backgroundDynamicPattern || "flow");
  const extra = pattern === "ripple"
    ? `repeating-radial-gradient(circle at 50% 56%, ${alpha(theme.colors.primary, 0.12)} 0 2%, transparent 2% 8%), `
    : pattern === "float"
      ? `radial-gradient(circle at 32% 42%, ${alpha(theme.colors.secondary, 0.22)} 0, transparent ${scale + 34}%), `
      : pattern === "zoom"
        ? `radial-gradient(circle at 50% 50%, ${alpha(theme.colors.accent, 0.26)} 0, transparent ${scale + 48}%), `
      : "";
  return `${overlay}${extra}radial-gradient(circle at 8% 8%, ${alpha(theme.colors.primary, 0.66)} 0, transparent ${scale}%), radial-gradient(circle at 92% 14%, ${alpha(theme.colors.secondary, 0.6)} 0, transparent ${scale + 18}%), radial-gradient(circle at 24% 86%, ${alpha(theme.colors.accent, 0.5)} 0, transparent ${scale + 26}%), radial-gradient(circle at 72% 58%, ${alpha(theme.colors.primary, 0.32)} 0, transparent ${scale + 8}%), linear-gradient(132deg, ${from} 0%, ${to} 58%, ${theme.colors.accentSoft} 148%)`;
}

function normalizePresetId(value: unknown): CmsThemePresetId {
  if (value === "tech-black-gold" || value === "fresh-green" || value === "summit-red" || value === "education-vitality") {
    return value;
  }
  return "business-blue";
}

function alpha(value: string, opacity: number): string {
  if (/^rgba?\(/i.test(value)) return value;
  if (!/^#[0-9a-f]{6}$/i.test(value)) return `rgba(31, 77, 122, ${opacity})`;
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function darkenFallback(value: string, fallback: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const r = Math.max(0, parseInt(value.slice(1, 3), 16) - 28);
  const g = Math.max(0, parseInt(value.slice(3, 5), 16) - 28);
  const b = Math.max(0, parseInt(value.slice(5, 7), 16) - 28);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
