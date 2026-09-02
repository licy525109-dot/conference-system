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

export const CONFERENCE_DETAIL_RICH_TEXT_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "span",
  "a",
  "img",
  "br",
  "hr",
  "code",
  "pre"
] as const;

export type ConferenceDetailRichTextElementName = typeof CONFERENCE_DETAIL_RICH_TEXT_ELEMENTS[number];

export interface ConferenceDetailRichTextTextNode {
  type: "text";
  text: string;
}

export interface ConferenceDetailRichTextElementNode {
  name: ConferenceDetailRichTextElementName;
  attrs: Record<string, string>;
  children: ConferenceDetailRichTextNode[];
}

export type ConferenceDetailRichTextNode =
  | ConferenceDetailRichTextTextNode
  | ConferenceDetailRichTextElementNode;

export interface ConferenceDetailRichTextContent {
  version: 1;
  html: string;
  nodes: ConferenceDetailRichTextNode[];
}

export interface ConferenceDetailSection {
  id: string;
  title: string;
  enabled: boolean;
  sort: number;
  content: ConferenceDetailRichTextContent;
}

export interface ConferenceDetailSections {
  version: 1;
  items: ConferenceDetailSection[];
}

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

export function normalizeConferenceDetailRichText(value: unknown): ConferenceDetailRichTextContent {
  const root = readRecord(value);
  const nested = readRecord(root.detailRichText ?? root.conferenceDetailRichText);
  const source = Object.keys(nested).length > 0
    ? nested
    : root.version === 1 && (typeof root.html === "string" || Array.isArray(root.nodes))
      ? root
      : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];

  return {
    version: 1,
    html: readRawString(source.html).slice(0, 500_000),
    nodes: rawNodes
      .slice(0, 2_000)
      .map((node) => normalizeConferenceDetailRichTextNode(node, 0))
      .filter((node): node is ConferenceDetailRichTextNode => node !== null)
  };
}

export function hasConferenceDetailRichTextContract(value: unknown): boolean {
  const root = readRecord(value);
  const source = readRecord(root.detailRichText ?? root.conferenceDetailRichText);
  return source.version === 1 && (typeof source.html === "string" || Array.isArray(source.nodes));
}

export function serializeConferenceDetailRichText(
  html: string,
  nodes: ConferenceDetailRichTextNode[]
): ConferenceDetailRichTextContent {
  return normalizeConferenceDetailRichText({ version: 1, html, nodes });
}

export function isConferenceDetailRichTextRenderable(content: ConferenceDetailRichTextContent): boolean {
  return content.nodes.some(isRenderableRichTextNode);
}

export function normalizeConferenceDetailSections(value: unknown): ConferenceDetailSections {
  const root = readRecord(value);
  const source = readRecord(root.detailSections ?? root.conferenceDetailSections);
  const rawItems = Array.isArray(source.items) ? source.items : [];

  return {
    version: 1,
    items: rawItems
      .slice(0, 12)
      .map((item, index) => {
        const record = readRecord(item);
        return {
          id: readString(record.id) || `conference-detail-section-${index + 1}`,
          title: readString(record.title) || `栏目 ${index + 1}`,
          enabled: typeof record.enabled === "boolean" ? record.enabled : true,
          sort: readFiniteNumber(record.sort, (index + 1) * 10),
          content: normalizeConferenceDetailRichText(readRecord(record.content))
        };
      })
      .sort((left, right) => left.sort - right.sort)
      .map((item, index) => ({ ...item, sort: (index + 1) * 10 }))
  };
}

export function hasConferenceDetailSectionsContract(value: unknown): boolean {
  const root = readRecord(value);
  const source = readRecord(root.detailSections ?? root.conferenceDetailSections);
  return source.version === 1 && Array.isArray(source.items);
}

export function serializeConferenceDetailSections(items: ConferenceDetailSection[]): ConferenceDetailSections {
  return normalizeConferenceDetailSections({
    detailSections: {
      version: 1,
      items
    }
  });
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

function readRawString(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function normalizeConferenceDetailRichTextNode(
  value: unknown,
  depth: number
): ConferenceDetailRichTextNode | null {
  if (depth > 20) return null;
  const source = readRecord(value);
  if (source.type === "text") {
    const text = readRawString(source.text).slice(0, 100_000);
    return text ? { type: "text", text } : null;
  }

  const name = readString(source.name).toLowerCase();
  if (!CONFERENCE_DETAIL_RICH_TEXT_ELEMENTS.includes(name as ConferenceDetailRichTextElementName)) {
    return null;
  }
  const children = (Array.isArray(source.children) ? source.children : [])
    .slice(0, 1_000)
    .map((child) => normalizeConferenceDetailRichTextNode(child, depth + 1))
    .filter((child): child is ConferenceDetailRichTextNode => child !== null);

  return {
    name: name as ConferenceDetailRichTextElementName,
    attrs: normalizeRichTextAttrs(source.attrs),
    children
  };
}

function normalizeRichTextAttrs(value: unknown): Record<string, string> {
  const source = readRecord(value);
  const attrs: Record<string, string> = {};
  for (const key of ["alt", "title", "target", "rel"] as const) {
    const attrValue = readString(source[key]).slice(0, 500);
    if (attrValue) attrs[key] = attrValue;
  }
  for (const key of ["src", "href"] as const) {
    const attrValue = readString(source[key]).slice(0, 2_000);
    if (isSafeRichTextUrl(attrValue)) attrs[key] = attrValue;
  }
  const style = normalizeRichTextStyle(source.style);
  if (style) attrs.style = style;
  return attrs;
}

function normalizeRichTextStyle(value: unknown): string {
  const source = readRawString(value).slice(0, 2_000);
  if (!source) return "";
  const allowed = new Set([
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-style",
    "text-decoration",
    "text-align",
    "line-height",
    "letter-spacing",
    "margin-left",
    "padding-left",
    "width",
    "max-width",
    "height",
    "display",
    "border-radius"
  ]);
  return source
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return "";
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (!allowed.has(property) || !propertyValue || /url\s*\(|expression|javascript:/i.test(propertyValue)) return "";
      return `${property}:${propertyValue}`;
    })
    .filter(Boolean)
    .join(";");
}

function isSafeRichTextUrl(value: string): boolean {
  return Boolean(value) && /^(https?:\/\/|\/)/i.test(value) && !/^javascript:/i.test(value);
}

function isRenderableRichTextNode(node: ConferenceDetailRichTextNode): boolean {
  if ("text" in node) return Boolean(node.text.trim());
  if (node.name === "img") return Boolean(node.attrs.src);
  if (node.name === "br") return false;
  if (node.name === "hr") return true;
  return node.children.some(isRenderableRichTextNode);
}
