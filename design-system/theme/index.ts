import { designTokens, mergeTokens, type DesignTokens, type TokenOverride } from "../tokens/index";

export interface LayoutPreset {
  pagePaddingX: string;
  sectionGap: string;
  cardGap: string;
  maxColumns: number;
}

export interface DesignTheme {
  id: string;
  name: string;
  tokens: DesignTokens;
  overrides: TokenOverride;
  layout: LayoutPreset;
}

export interface CreateThemeInput {
  id?: string;
  name?: string;
  overrides?: TokenOverride;
  layout?: Partial<LayoutPreset>;
}

export const defaultLayoutPreset: LayoutPreset = {
  pagePaddingX: designTokens.spacing.pageX,
  sectionGap: designTokens.spacing.sectionY,
  cardGap: designTokens.spacing.md,
  maxColumns: 4
};

export function createDesignTheme(input: CreateThemeInput = {}): DesignTheme {
  const overrides = input.overrides ?? {};
  return {
    id: input.id ?? "default",
    name: input.name ?? "Default",
    tokens: mergeTokens(designTokens, overrides),
    overrides,
    layout: {
      ...defaultLayoutPreset,
      ...input.layout
    }
  };
}
