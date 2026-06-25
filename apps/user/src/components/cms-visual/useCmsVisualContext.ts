import type { DslNode, PageDsl } from "@conference/dsl-runtime";
import type { CmsComponent } from "@/services/cms";

export function hasCmsVisualComponents(dsl: PageDsl): boolean {
  const editorComponents = dsl.meta?.editorComponents;
  return Array.isArray(editorComponents) && editorComponents.length > 0;
}

export function cmsVisualComponentsFromDsl(dsl: PageDsl): CmsComponent[] {
  const dslMeta = dsl.meta ?? {};
  const editorComponents = Array.isArray(dslMeta.editorComponents) ? dslMeta.editorComponents : [];
  if (editorComponents.length > 0) {
    return editorComponents.map((item, index) => normalizeDslComponent(item, index)).filter((item): item is CmsComponent => Boolean(item));
  }

  return (dsl.dsl?.nodes ?? []).map((node, index) => componentFromDslNode(node, index)).filter((item): item is CmsComponent => Boolean(item));
}

function normalizeDslComponent(value: unknown, index: number): CmsComponent | null {
  if (!isRecord(value)) return null;
  const type = readText(value.type);
  if (!type) return null;
  const config = isRecord(value.config) ? { ...value.config } : {};
  return {
    id: readText(value.id) || `cms-${index}`,
    type,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    sortOrder: readNumber(value.sortOrder, index * 10),
    config
  };
}

function componentFromDslNode(node: DslNode, index: number): CmsComponent | null {
  const type = readText(node.meta?.originalType) || componentTypeFromDslType(node.type);
  if (!type) return null;
  const config = isRecord(node.props) ? { ...node.props } : {};
  delete config.userContext;
  normalizeNodeActionConfig(config);
  removeTechnicalFallbackText(config, type, node.type);
  return {
    id: node.id || `dsl-${index}`,
    type,
    enabled: node.enabled !== false,
    sortOrder: typeof node.sortOrder === "number" ? node.sortOrder : index * 10,
    config
  };
}

function componentTypeFromDslType(type: string): string {
  const map: Record<string, string> = {
    "ds-banner": "hero-banner",
    "ds-carousel": "carousel",
    "ds-grid": "quick-icon-grid",
    "ds-list": "conference-list",
    "ds-section": "rich-content-block",
    "ds-card": "image-promo-card",
    "ds-button": "registration-button"
  };
  return map[type] || "";
}

function normalizeNodeActionConfig(config: Record<string, unknown>): void {
  const action = isRecord(config.action) ? config.action : {};
  if (!readText(config.actionTargetType) && readText(action.type)) config.actionTargetType = readText(action.type);
  if (!readText(config.targetPageKey) && readText(action.pageKey)) config.targetPageKey = readText(action.pageKey);
  if (!readText(config.targetConferenceId) && readText(action.conferenceId)) config.targetConferenceId = readText(action.conferenceId);
  if (!readText(config.targetProductId) && readText(action.productId)) config.targetProductId = readText(action.productId);
  if (!readText(config.externalUrl) && readText(action.url)) config.externalUrl = readText(action.url);
}

function removeTechnicalFallbackText(config: Record<string, unknown>, componentType: string, nodeType: string): void {
  const title = readText(config.title);
  const technicalTitles = new Set([componentType, nodeType, titleFor(componentType), titleFor(nodeType)]);
  if (technicalTitles.has(title)) delete config.title;
  const subtitle = readText(config.subtitle);
  if (technicalTitles.has(subtitle)) delete config.subtitle;
  const description = readText(config.description);
  if (technicalTitles.has(description)) delete config.description;
}

function titleFor(type: string): string {
  const map: Record<string, string> = {
    "hero-banner": "顶部主视觉 Banner",
    "quick-icon-grid": "图标入口宫格",
    "rich-text": "图文富文本",
    "rich-content-block": "自定义图文模块",
    "conference-schedule": "年度排期"
  };
  return map[type] || type;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
