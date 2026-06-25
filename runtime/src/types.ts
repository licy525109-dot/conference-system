import type { ComponentRegistry, RegisteredComponent } from "@conference/design-system";
import type { DesignTheme } from "@conference/design-system/theme";

export type DslSchemaVersion = "p9";
export type RuntimePlatform = "admin" | "h5" | "miniapp";

export interface DslNode {
  id: string;
  type: string;
  enabled?: boolean;
  sortOrder?: number;
  props?: Record<string, unknown>;
  children?: DslNode[];
  dataSource?: string;
  bindings?: Record<string, string>;
  meta?: Record<string, unknown>;
}

export interface DslAst {
  nodes: DslNode[];
}

export interface PageDsl {
  schemaVersion: DslSchemaVersion;
  page: string;
  dsl: DslAst;
  theme?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface RuntimeContext {
  page: string;
  platform: RuntimePlatform;
  theme: DesignTheme;
  data: Record<string, unknown>;
  registry: ComponentRegistry;
}

export interface ResolvedDslNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: ResolvedDslNode[];
  component: RegisteredComponent;
  meta: Record<string, unknown>;
}

export interface RuntimeRenderTree {
  schemaVersion: DslSchemaVersion;
  page: string;
  themeId: string;
  nodes: ResolvedDslNode[];
  warnings: string[];
}
