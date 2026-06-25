export interface CmsComponentForDsl {
  id: string;
  type: string;
  enabled?: boolean;
  sortOrder?: number;
  config?: Record<string, unknown>;
}

export interface PageDslForApi {
  schemaVersion: "p9";
  page: string;
  dsl: {
    nodes: DslNodeForApi[];
  };
  meta?: Record<string, unknown>;
}

export interface DslNodeForApi {
  id: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
  action?: Record<string, unknown>;
  children?: DslNodeForApi[];
  meta: Record<string, unknown>;
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

export function pageComponentsToDsl(components: unknown, page: string): PageDslForApi {
  if (isPageDsl(components) || isLegacyFlatDsl(components)) {
    return normalizePageDsl(components, page);
  }
  const source = Array.isArray(components) ? components : [];
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: source
        .map((item, index) => normalizeComponent(item, index))
        .filter((item): item is CmsComponentForDsl & { id: string; type: string; config: Record<string, unknown> } => Boolean(item))
        .filter((item) => item.enabled !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((component, index) => ({
          id: component.id,
          type: LEGACY_TO_DS_TYPE[component.type] ?? "ds-section",
          enabled: true,
          sortOrder: Number.isFinite(Number(component.sortOrder)) ? Number(component.sortOrder) : index * 10,
          props: {
            ...component.config,
            title: readString(component.config.title) || readString(component.config.name) || component.type,
            subtitle: readString(component.config.subtitle) || readString(component.config.description),
            description: readString(component.config.description) || readString(component.config.content) || readString(component.config.text),
            imageUrl: readString(component.config.imageUrl) || readString(component.config.coverImageUrl),
            images: Array.isArray(component.config.images) ? component.config.images.filter((value): value is string => typeof value === "string") : [],
            items: Array.isArray(component.config.items) ? component.config.items : []
          },
          meta: {
            source: "cms-dsl",
            originalType: component.type
          }
        }))
    },
    meta: {
      source: "legacy-components"
    }
  };
}

export function normalizePageDsl(input: unknown, fallbackPage: string): PageDslForApi {
  const record = isRecord(input) ? input : {};
  const maybeDsl = isRecord(record.dsl) ? record.dsl : record;
  const page = readString(record.page) || readString(maybeDsl.page) || fallbackPage;
  const nodes = Array.isArray(maybeDsl.nodes) ? maybeDsl.nodes : [];
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: nodes.map((node, index) => normalizeDslNode(node, index)).filter((node): node is DslNodeForApi => Boolean(node))
    },
    ...(isRecord(record.meta) ? { meta: record.meta } : {})
  };
}

export function assertPageDsl(input: unknown, fallbackPage: string): PageDslForApi {
  const dsl = normalizePageDsl(input, fallbackPage);
  for (const node of dsl.dsl.nodes) {
    assertDslNode(node);
  }
  return dsl;
}

export function countDslNodes(input: unknown): number {
  return pageComponentsToDsl(input, "cms").dsl.nodes.length;
}

function normalizeDslNode(value: unknown, index: number): DslNodeForApi | null {
  if (!isRecord(value)) return null;
  const type = readString(value.type);
  if (!type) return null;
  const props = isRecord(value.props) ? value.props : {};
  const style = isRecord(value.style) ? value.style : undefined;
  const action = isRecord(value.action) ? value.action : undefined;
  const children = Array.isArray(value.children) ? value.children.map((child, childIndex) => normalizeDslNode(child, childIndex)).filter((child): child is DslNodeForApi => Boolean(child)) : undefined;
  return {
    id: readString(value.id) || `${type}-${index + 1}`,
    type,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10,
    props: action ? { ...props, action } : props,
    ...(style ? { style } : {}),
    ...(action ? { action } : {}),
    ...(children && children.length > 0 ? { children } : {}),
    meta: isRecord(value.meta) ? value.meta : {}
  };
}

function assertDslNode(node: DslNodeForApi): void {
  const allowedTypes = new Set(["ds-banner", "ds-grid", "ds-card", "ds-list", "ds-section", "ds-button", "ds-tag", "ds-image", "ds-carousel"]);
  if (!allowedTypes.has(node.type)) {
    throw new Error(`未知 DSL 组件类型：${node.type}`);
  }
  const html = typeof node.props.html === "string" ? node.props.html : "";
  if (/<\s*script/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) {
    throw new Error("DSL HTML 不允许包含脚本、事件属性或 javascript 协议");
  }
  for (const child of node.children ?? []) assertDslNode(child);
}

function isPageDsl(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.schemaVersion === "p9" && isRecord(value.dsl) && Array.isArray(value.dsl.nodes);
}

function isLegacyFlatDsl(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.schemaVersion === "p9" && Array.isArray(value.nodes);
}

function normalizeComponent(value: unknown, index: number): (CmsComponentForDsl & { id: string; type: string; config: Record<string, unknown> }) | null {
  if (!isRecord(value)) return null;
  const type = readString(value.type);
  if (!type) return null;
  return {
    id: readString(value.id) || `${type}-${index}`,
    type,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10,
    config: isRecord(value.config) ? value.config : {}
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
