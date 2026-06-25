import { createRuntimeContext, renderDsl, type PageDsl, type RuntimeContext, type RuntimeRenderTree } from "@conference/dsl-runtime";
import { createDesignSystemRegistry, type ComponentRegistry } from "@conference/design-system";
import { compileBusinessModules } from "@conference/module-compiler";
import type { BusinessModule } from "@conference/business-modules";

export type RenderGovernorWarningCode =
  | "BUSINESS_MODULES_COMPILED"
  | "NON_DSL_INPUT"
  | "LEGACY_FLAT_DSL"
  | "LEGACY_CMS_COMPONENTS"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "UNKNOWN_REGISTRY_COMPONENT";

export interface RenderGovernorWarning {
  code: RenderGovernorWarningCode;
  message: string;
  nodeId?: string;
  type?: string;
}

export interface GovernedRenderInput {
  dsl?: PageDsl | null;
  modules?: BusinessModule[] | null;
  components?: LegacyCmsComponent[] | null;
  page?: string;
}

export interface LegacyCmsComponent {
  id: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface GovernedRenderResult {
  dsl: PageDsl;
  tree: RuntimeRenderTree;
  warnings: RenderGovernorWarning[];
}

export interface GovernRenderOptions {
  context: RuntimeContext;
  allowLegacyDslFallback?: boolean;
}

const LEGACY_TO_DS_TYPE: Record<string, string> = {
  hero: "ds-banner",
  "hero-banner": "ds-banner",
  carousel: "ds-carousel",
  "quick-icon-grid": "ds-grid",
  "image-grid": "ds-grid",
  "mall-product-grid": "ds-grid",
  "conference-list": "ds-list",
  "conference-schedule": "ds-list",
  "conference-tabs": "ds-list",
  "event-card-carousel": "ds-list",
  "rich-content-block": "ds-section",
  "rich-text": "ds-section",
  "safe-html": "ds-section",
  "text-image": "ds-section",
  title: "ds-section",
  notice: "ds-card",
  "member-promo-banner": "ds-banner",
  "image-promo-card": "ds-card",
  "service-shortcut-card": "ds-grid",
  "task-progress-card": "ds-card",
  "registration-button": "ds-button",
  "floating-registration-button": "ds-button",
  "credential-header": "ds-card",
  "credential-qr": "ds-card",
  "credential-conference-info": "ds-card",
  "credential-attendee-info": "ds-card",
  "credential-payment-info": "ds-card",
  "credential-form-summary": "ds-card",
  "credential-checkin-info": "ds-card",
  "credential-actions": "ds-grid"
};

export function createGovernedRuntimeContext(input: {
  page: string;
  platform: "admin" | "h5" | "miniapp";
  theme?: Parameters<typeof createRuntimeContext>[0]["theme"];
  data?: Record<string, unknown>;
  registry?: ComponentRegistry;
}): RuntimeContext {
  return createRuntimeContext({
    page: input.page,
    platform: input.platform,
    theme: input.theme,
    data: input.data,
    registry: input.registry ?? createDesignSystemRegistry()
  });
}

export function governRender(input: PageDsl | GovernedRenderInput | unknown, options: GovernRenderOptions): GovernedRenderResult {
  const warnings: RenderGovernorWarning[] = [];
  const dsl = normalizeRenderInput(input, options.context.page, warnings, options.allowLegacyDslFallback !== false);
  validateDsl(dsl, options.context.registry, warnings);
  const tree = renderDsl(dsl, options.context);
  for (const warning of tree.warnings) {
    warnings.push({
      code: "UNKNOWN_REGISTRY_COMPONENT",
      message: warning
    });
  }
  return { dsl, tree, warnings };
}

export function normalizeRenderInput(input: PageDsl | GovernedRenderInput | unknown, fallbackPage: string, warnings: RenderGovernorWarning[], allowLegacyDslFallback = true): PageDsl {
  if (isRecord(input) && Array.isArray(input.modules)) {
    warnings.push({
      code: "BUSINESS_MODULES_COMPILED",
      message: "Business modules were compiled to locked P9 DSL before rendering."
    });
    return compileBusinessModules({ page: readString(input.page) || fallbackPage, modules: input.modules as BusinessModule[] }).dsl;
  }

  if (isPageDsl(input)) {
    if (!isSupportedSchemaVersion(input.schemaVersion)) {
      warnings.push({
        code: "UNSUPPORTED_SCHEMA_VERSION",
        message: `Unsupported DSL schemaVersion: ${input.schemaVersion}`
      });
      return emptyDsl(input.page || fallbackPage);
    }
    return input;
  }

  if (isRecord(input) && isPageDsl(input.dsl)) {
    return normalizeRenderInput(input.dsl, fallbackPage, warnings, allowLegacyDslFallback);
  }

  if (allowLegacyDslFallback && isLegacyFlatDsl(input)) {
    warnings.push({
      code: "LEGACY_FLAT_DSL",
      message: "Legacy flat P9 DSL was normalized to locked P9 DSL document shape."
    });
    return normalizeLegacyFlatDsl(input, fallbackPage);
  }

  if (allowLegacyDslFallback && isRecord(input) && Array.isArray(input.components)) {
    warnings.push({
      code: "LEGACY_CMS_COMPONENTS",
      message: "Legacy CMS components were downgraded to P9 DSL. Legacy UI rendering is disabled."
    });
    return legacyCmsComponentsToDsl(input.components as LegacyCmsComponent[], readString(input.page) || fallbackPage);
  }

  warnings.push({
    code: "NON_DSL_INPUT",
    message: "Render input is not P9 DSL. Rendering an empty DSL page."
  });
  return emptyDsl(fallbackPage);
}

export function legacyCmsComponentsToDsl(components: LegacyCmsComponent[], page = "custom"): PageDsl {
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: components
        .filter((component) => component.enabled !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((component, index) => ({
          id: component.id || `${component.type}-${index}`,
          type: LEGACY_TO_DS_TYPE[component.type] ?? "ds-section",
          enabled: true,
          sortOrder: Number.isFinite(Number(component.sortOrder)) ? Number(component.sortOrder) : index * 10,
          props: normalizeLegacyProps(component),
          meta: {
            source: "legacy-cms-disabled",
            originalType: component.type
          }
        }))
    }
  };
}

export function validateDsl(dsl: PageDsl, registry: ComponentRegistry, warnings: RenderGovernorWarning[]): void {
  if (!isSupportedSchemaVersion(dsl.schemaVersion)) {
    warnings.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      message: `Unsupported DSL schemaVersion: ${dsl.schemaVersion}`
    });
  }
  for (const node of dsl.dsl.nodes) {
    if (!registry.has(node.type)) {
      warnings.push({
        code: "UNKNOWN_REGISTRY_COMPONENT",
        message: `Unknown registry component: ${node.type}`,
        nodeId: node.id,
        type: node.type
      });
    }
  }
}

function normalizeLegacyProps(component: LegacyCmsComponent): Record<string, unknown> {
  const config = isRecord(component.config) ? component.config : {};
  const title = readString(config.title) || readString(config.name) || component.type;
  const subtitle = readString(config.subtitle) || readString(config.description) || readString(config.text);
  const imageUrl = readString(config.imageUrl) || readString(config.coverImageUrl);
  const images = Array.isArray(config.images) ? config.images.filter((item): item is string => typeof item === "string") : [];
  const items = Array.isArray(config.items) ? config.items : [];
  return {
    ...config,
    title,
    subtitle,
    description: readString(config.description) || readString(config.content) || "",
    imageUrl,
    images,
    items,
    text: readString(config.buttonText) || readString(config.text) || "",
    originalType: component.type
  };
}

function emptyDsl(page: string): PageDsl {
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: []
    }
  };
}

function isPageDsl(value: unknown): value is PageDsl {
  return isRecord(value) && value.schemaVersion === "p9" && typeof value.page === "string" && isRecord(value.dsl) && Array.isArray(value.dsl.nodes);
}

function isLegacyFlatDsl(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.schemaVersion === "p9" && Array.isArray(value.nodes);
}

function normalizeLegacyFlatDsl(value: Record<string, unknown>, fallbackPage: string): PageDsl {
  return {
    schemaVersion: "p9",
    page: readString(value.page) || fallbackPage,
    dsl: {
      nodes: (value.nodes as PageDsl["dsl"]["nodes"]).map((node) => ({ ...node }))
    },
    theme: isRecord(value.theme) ? value.theme : undefined,
    meta: isRecord(value.meta) ? value.meta : undefined
  };
}

function isSupportedSchemaVersion(value: unknown): boolean {
  return value === "p9";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
