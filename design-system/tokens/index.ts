export type TokenScale<TValue> = Record<string, TValue>;

export interface DesignTokens {
  spacing: TokenScale<string>;
  radius: TokenScale<string>;
  colors: TokenScale<string>;
  shadow: TokenScale<string>;
  typography: TokenScale<{
    fontSize: string;
    lineHeight: string;
    fontWeight: number;
  }>;
  zIndex: TokenScale<number>;
}

export const designTokens: DesignTokens = {
  spacing: {
    none: "0",
    xxs: "4rpx",
    xs: "8rpx",
    sm: "12rpx",
    md: "16rpx",
    lg: "24rpx",
    xl: "32rpx",
    xxl: "48rpx",
    pageX: "28rpx",
    sectionY: "24rpx",
    cardPadding: "28rpx"
  },
  radius: {
    none: "0",
    xs: "4rpx",
    sm: "8rpx",
    md: "12rpx",
    lg: "16rpx",
    xl: "24rpx",
    full: "999rpx"
  },
  colors: {
    primary: "#315d7d",
    primaryStrong: "#244761",
    primarySoft: "#e6eef4",
    secondary: "#3a8f79",
    accent: "#b58b47",
    background: "#f5f7f6",
    surface: "#ffffff",
    surfaceSoft: "#f8faf9",
    surfaceMuted: "#edf3f0",
    textPrimary: "#172026",
    textSecondary: "#5f6d76",
    textMuted: "#8a969e",
    textInverse: "#ffffff",
    border: "#dbe4e1",
    divider: "#e7eeeb",
    success: "#1f8a5b",
    warning: "#a66b00",
    danger: "#c14242"
  },
  shadow: {
    none: "none",
    sm: "0 4rpx 14rpx rgba(23, 32, 38, 0.06)",
    md: "0 10rpx 28rpx rgba(23, 32, 38, 0.08)",
    lg: "0 18rpx 48rpx rgba(23, 32, 38, 0.12)"
  },
  typography: {
    caption: { fontSize: "22rpx", lineHeight: "32rpx", fontWeight: 400 },
    body: { fontSize: "28rpx", lineHeight: "42rpx", fontWeight: 400 },
    label: { fontSize: "26rpx", lineHeight: "36rpx", fontWeight: 600 },
    title: { fontSize: "34rpx", lineHeight: "46rpx", fontWeight: 700 },
    hero: { fontSize: "44rpx", lineHeight: "58rpx", fontWeight: 800 }
  },
  zIndex: {
    base: 0,
    content: 1,
    sticky: 20,
    header: 50,
    overlay: 100,
    modal: 200,
    toast: 300
  }
};

export type TokenOverride = Partial<{
  [K in keyof DesignTokens]: Partial<DesignTokens[K]>;
}>;

export function mergeTokens(base: DesignTokens, override: TokenOverride = {}): DesignTokens {
  return {
    spacing: mergeScale(base.spacing, override.spacing),
    radius: mergeScale(base.radius, override.radius),
    colors: mergeScale(base.colors, override.colors),
    shadow: mergeScale(base.shadow, override.shadow),
    typography: mergeScale(base.typography, override.typography),
    zIndex: mergeScale(base.zIndex, override.zIndex)
  };
}

function mergeScale<TValue>(base: TokenScale<TValue>, override: Partial<TokenScale<TValue>> | undefined): TokenScale<TValue> {
  if (!override) return { ...base };
  const next: TokenScale<TValue> = { ...base };
  for (const [key, value] of Object.entries(override) as Array<[string, TValue | undefined]>) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export function tokenCssVariables(tokens: DesignTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens.spacing)) vars[`--ds-space-${name}`] = value;
  for (const [name, value] of Object.entries(tokens.radius)) vars[`--ds-radius-${name}`] = value;
  for (const [name, value] of Object.entries(tokens.colors)) vars[`--ds-color-${name}`] = value;
  for (const [name, value] of Object.entries(tokens.shadow)) vars[`--ds-shadow-${name}`] = value;
  for (const [name, value] of Object.entries(tokens.zIndex)) vars[`--ds-z-${name}`] = String(value);
  for (const [name, value] of Object.entries(tokens.typography)) {
    vars[`--ds-font-size-${name}`] = value.fontSize;
    vars[`--ds-line-height-${name}`] = value.lineHeight;
    vars[`--ds-font-weight-${name}`] = String(value.fontWeight);
  }
  return vars;
}
