export const CMS_RUNTIME_PREVIEW_CHANNEL = "conference-cms-runtime-preview" as const;
export const CMS_RUNTIME_PREVIEW_VERSION = 1 as const;

export interface CmsRuntimePreviewPayload {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "render";
  platform: "h5" | "miniapp";
  dsl: unknown;
  theme: Record<string, unknown>;
  conferences: unknown[];
  products: unknown[];
  userContext: Record<string, unknown> | null;
  selectedComponentId: string;
}

export interface CmsRuntimePreviewReadyMessage {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "ready";
}

export interface CmsRuntimePreviewSelectMessage {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "select-component";
  componentId: string;
}

export interface CmsRuntimePreviewReorderMessage {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "reorder-component";
  sourceId: string;
  targetId: string;
}

export interface CmsRuntimePreviewHeightMessage {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "content-height";
  height: number;
}

export interface CmsRuntimePreviewErrorMessage {
  channel: typeof CMS_RUNTIME_PREVIEW_CHANNEL;
  version: typeof CMS_RUNTIME_PREVIEW_VERSION;
  sessionId: string;
  type: "render-error";
  message: string;
}

export type CmsRuntimePreviewChildMessage =
  | CmsRuntimePreviewReadyMessage
  | CmsRuntimePreviewSelectMessage
  | CmsRuntimePreviewReorderMessage
  | CmsRuntimePreviewHeightMessage
  | CmsRuntimePreviewErrorMessage;

export function isCmsRuntimePreviewPayload(value: unknown): value is CmsRuntimePreviewPayload {
  if (!isRecord(value)) return false;
  return value.channel === CMS_RUNTIME_PREVIEW_CHANNEL
    && value.version === CMS_RUNTIME_PREVIEW_VERSION
    && value.type === "render"
    && typeof value.sessionId === "string"
    && (value.platform === "h5" || value.platform === "miniapp")
    && isRecord(value.theme)
    && Array.isArray(value.conferences)
    && Array.isArray(value.products)
    && typeof value.selectedComponentId === "string";
}

export function isCmsRuntimePreviewChildMessage(value: unknown): value is CmsRuntimePreviewChildMessage {
  if (!isRecord(value)) return false;
  if (value.channel !== CMS_RUNTIME_PREVIEW_CHANNEL || value.version !== CMS_RUNTIME_PREVIEW_VERSION || typeof value.sessionId !== "string") {
    return false;
  }
  if (value.type === "ready") return true;
  if (value.type === "select-component") return typeof value.componentId === "string";
  if (value.type === "reorder-component") return typeof value.sourceId === "string" && typeof value.targetId === "string";
  if (value.type === "content-height") return Number.isFinite(Number(value.height));
  return value.type === "render-error" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
