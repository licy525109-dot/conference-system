export const CONFERENCE_DETAIL_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "image",
  "quote",
  "list",
  "divider",
  "button"
] as const;

export type ConferenceDetailBlockType = typeof CONFERENCE_DETAIL_BLOCK_TYPES[number];
export type ConferenceDetailTextAlign = "left" | "center" | "right";
export type ConferenceDetailTone = "default" | "accent" | "muted";
export type ConferenceDetailImageMode = "widthFix" | "aspectFill" | "aspectFit";
export type ConferenceDetailImageRatio = "auto" | "16:9" | "4:3" | "1:1";
export type ConferenceDetailButtonStyle = "primary" | "secondary" | "text";
export type ConferenceDetailActionType = "none" | "registration" | "phone" | "copy" | "external-h5";

export interface ConferenceDetailContentBlock {
  id: string;
  enabled: boolean;
  sort: number;
  type: ConferenceDetailBlockType;
  title: string;
  text: string;
  items: string[];
  imageUrl: string;
  caption: string;
  imageMode: ConferenceDetailImageMode;
  imageRatio: ConferenceDetailImageRatio;
  align: ConferenceDetailTextAlign;
  tone: ConferenceDetailTone;
  buttonText: string;
  buttonStyle: ConferenceDetailButtonStyle;
  actionTargetType: ConferenceDetailActionType;
  phone: string;
  copyText: string;
  externalUrl: string;
}

export interface ConferenceDetailContent {
  version: 1;
  blocks: ConferenceDetailContentBlock[];
}

export function normalizeConferenceDetailContent(value: unknown): ConferenceDetailContent {
  const root = readRecord(value);
  const nestedContent = root.detailContent ?? root.conferenceDetailContent ?? root.detailRichContent;
  const rawContent = readRecord(nestedContent);
  const rawBlocks = Array.isArray(rawContent.blocks)
    ? rawContent.blocks
    : Array.isArray(root.detailBlocks)
      ? root.detailBlocks
      : root.version === 1 && Array.isArray(root.blocks)
        ? root.blocks
        : [];

  return {
    version: 1,
    blocks: rawBlocks
      .map((block, index) => normalizeConferenceDetailBlock(block, index))
      .sort((left, right) => left.sort - right.sort)
      .map((block, index) => ({ ...block, sort: (index + 1) * 10 }))
  };
}

export function normalizeConferenceDetailBlock(
  value: unknown,
  index = 0
): ConferenceDetailContentBlock {
  const source = readRecord(value);
  const type = normalizeBlockType(source.type);
  const listItems = readStringArray(source.items ?? source.listItems);
  const text = readString(source.text ?? source.content ?? source.description);

  return {
    id: readString(source.id) || `conference-detail-${index + 1}`,
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    sort: readFiniteNumber(source.sort, (index + 1) * 10),
    type,
    title: readString(source.title ?? source.heading),
    text,
    items: listItems.length > 0
      ? listItems
      : type === "list"
        ? text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        : [],
    imageUrl: readString(source.imageUrl ?? source.url ?? source.src),
    caption: readString(source.caption ?? source.alt),
    imageMode: readEnum(source.imageMode, ["widthFix", "aspectFill", "aspectFit"], "widthFix"),
    imageRatio: readEnum(source.imageRatio ?? source.ratio, ["auto", "16:9", "4:3", "1:1"], "auto"),
    align: readEnum(source.align, ["left", "center", "right"], "left"),
    tone: readEnum(source.tone, ["default", "accent", "muted"], "default"),
    buttonText: readString(source.buttonText ?? source.label) || (type === "button" ? "立即报名" : ""),
    buttonStyle: readEnum(source.buttonStyle, ["primary", "secondary", "text"], "primary"),
    actionTargetType: readEnum(
      source.actionTargetType ?? source.targetType ?? source.actionType,
      ["none", "registration", "phone", "copy", "external-h5"],
      type === "button" ? "registration" : "none"
    ),
    phone: readString(source.phone),
    copyText: readString(source.copyText),
    externalUrl: readString(source.externalUrl ?? (source.actionTargetType === "external-h5" ? source.url : ""))
  };
}

export function serializeConferenceDetailContent(
  blocks: ConferenceDetailContentBlock[]
): ConferenceDetailContent {
  return {
    version: 1,
    blocks: blocks
      .map((block, index) => normalizeConferenceDetailBlock(block, index))
      .map((block, index) => ({ ...block, sort: (index + 1) * 10 }))
  };
}

export function isConferenceDetailBlockRenderable(block: ConferenceDetailContentBlock): boolean {
  if (!block.enabled) return false;
  if (block.type === "divider") return true;
  if (block.type === "heading") return Boolean(block.title);
  if (block.type === "paragraph" || block.type === "quote") return Boolean(block.text);
  if (block.type === "list") return block.items.length > 0;
  if (block.type === "image") return Boolean(block.imageUrl);
  return Boolean(block.buttonText);
}

function normalizeBlockType(value: unknown): ConferenceDetailBlockType {
  const raw = readString(value);
  const aliases: Record<string, ConferenceDetailBlockType> = {
    title: "heading",
    text: "paragraph",
    picture: "image",
    callout: "quote",
    bullets: "list",
    separator: "divider",
    action: "button"
  };
  const normalized = aliases[raw] ?? raw;
  return CONFERENCE_DETAIL_BLOCK_TYPES.includes(normalized as ConferenceDetailBlockType)
    ? normalized as ConferenceDetailBlockType
    : "paragraph";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function readFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEnum<TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  fallback: TValue
): TValue {
  const parsed = readString(value) as TValue;
  return values.includes(parsed) ? parsed : fallback;
}
