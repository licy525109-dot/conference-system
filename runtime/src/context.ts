import { createDesignSystemRegistry, createDesignTheme, type ComponentRegistry, type CreateThemeInput } from "@conference/design-system";
import type { RuntimeContext, RuntimePlatform } from "./types";

export interface CreateRuntimeContextInput {
  page: string;
  platform: RuntimePlatform;
  theme?: CreateThemeInput;
  data?: Record<string, unknown>;
  registry?: ComponentRegistry;
}

export function createRuntimeContext(input: CreateRuntimeContextInput): RuntimeContext {
  return {
    page: input.page,
    platform: input.platform,
    theme: createDesignTheme(input.theme),
    data: input.data ?? {},
    registry: input.registry ?? createDesignSystemRegistry()
  };
}
