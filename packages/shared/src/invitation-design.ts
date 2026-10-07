export const INVITATION_FONTS = {
  sans: {
    label: "黑体",
    family: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
  serif: { label: "宋体", family: '"Songti SC", "STSong", serif' },
  kai: { label: "楷体", family: '"Kaiti SC", "STKaiti", "KaiTi", serif' },
} as const;
export type InvitationFont = keyof typeof INVITATION_FONTS;
export const INVITATION_CUSTOM_FONT = "var(--invite-custom-font)";
export interface InvitationTextLayer {
  id: string;
  label: string;
  text: string;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  font: InvitationFont | "custom";
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
}
export interface InvitationCover {
  mode: "template" | "artwork";
  width: number;
  height: number;
  layers: InvitationTextLayer[];
}
export type InvitationRichNode =
  | { text: string }
  | {
      tag: string;
      attrs: Record<string, string>;
      children: InvitationRichNode[];
    };
export const INVITATION_MODULE_LABELS = {
  letter: "邀请正文",
  highlights: "相聚的理由",
  agenda: "会议议程",
  guests: "嘉宾介绍",
  invitees: "拟邀名单",
  venue: "赴约信息",
  richtext: "图文内容",
  image: "图片",
  video: "视频",
  audio: "音频",
  carousel: "轮播图",
  tabs: "标签页",
  map: "地图导航",
  links: "图标与链接",
  search: "内容搜索",
  organizations: "组织架构",
} as const;
export type InvitationModuleType = keyof typeof INVITATION_MODULE_LABELS;
export interface InvitationModule {
  id: string;
  type: InvitationModuleType;
  title: string;
  enabled: boolean;
  body: InvitationRichNode[];
  imageUrl: string;
  style?: InvitationModuleStyle;
  settings?: InvitationModuleSettings;
  items?: InvitationModuleItem[];
}
export interface InvitationNavigationItem {
  moduleId: string;
  label: string;
  visible: boolean;
}
export interface InvitationNavigation {
  enabled: boolean;
  sticky: boolean;
  items: InvitationNavigationItem[];
}
export interface InvitationModuleStyle {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  backgroundImage: string;
  spacing: "compact" | "comfortable" | "spacious";
  align: "left" | "center";
}
export interface InvitationModuleItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  href: string;
  icon: string;
  body: InvitationRichNode[];
}
export interface InvitationModuleSettings {
  mediaUrl: string;
  posterUrl: string;
  effect: "slide" | "fade" | "coverflow" | "flip";
  autoplay: boolean;
  interval: number;
  ratio: "16/9" | "4/3" | "1/1" | "3/4";
  fit: "contain" | "cover";
  layout: "grid" | "list";
  logoColumns: number;
  logoHeight: number;
  showOrganizationNames: boolean;
  agendaTitleSize: number;
  agendaMetaSize: number;
  agendaLineHeight: number;
  agendaWeight: number;
  agendaPadding: number;
  agendaLayout: "auto" | "tabs" | "continuous";
  textPresentation: "auto" | "prose" | "keywords";
  note: string;
  showNote: boolean;
  latitude: number | null;
  longitude: number | null;
  zoom: number;
  address: string;
}
export interface InvitationPageDesign {
  textColor: string;
  backgroundImage: string;
  backgroundMotion: "none" | "pan" | "breathe";
  backgroundOpacity: number;
  font: InvitationFont | "custom" | "default";
  fontUrl: string;
  fontName: string;
  replaceAllFonts: boolean;
  bodySize: number;
}
export const INVITATION_ICONS = [
  "link",
  "location",
  "calendar",
  "phone",
  "ticket",
  "video",
  "document",
  "star",
] as const;
export const INVITATION_SINGLETON_MODULES = [
  "letter",
  "highlights",
  "agenda",
  "guests",
  "invitees",
  "venue",
];
export const invitationModuleRepeatable = (type: string) =>
  !INVITATION_SINGLETON_MODULES.includes(type);
export interface InvitationEffects {
  entrance: "rise" | "fade" | "unfold" | "none";
  cover: "none" | "fade" | "focus";
  scroll: "continuous" | "chapters";
  duration: number;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown, limit = 200) =>
  typeof v === "string" ? v.slice(0, limit) : "";
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;
const color = (v: unknown) => (/^#[a-f0-9]{6}$/i.test(str(v)) ? str(v) : "");
export function normalizeInvitationNavigation(
  value: unknown,
  modules: InvitationModule[],
): InvitationNavigation {
  const source = record(value);
  const ids = new Set(modules.map((module) => module.id));
  const seen = new Set<string>();
  const items: InvitationNavigationItem[] = [];
  for (const value of (Array.isArray(source.items) ? source.items : []).slice(
    0,
    24,
  )) {
    const item = record(value),
      moduleId = str(item.moduleId, 80);
    if (!ids.has(moduleId) || seen.has(moduleId)) continue;
    seen.add(moduleId);
    items.push({
      moduleId,
      label: str(item.label, 40).trim(),
      visible: item.visible !== false,
    });
  }
  // New modules join the end; removed modules and duplicate targets cannot leave dead links.
  for (const module of modules) {
    if (!seen.has(module.id)) {
      seen.add(module.id);
      items.push({ moduleId: module.id, label: "", visible: true });
    }
  }
  return {
    enabled: source.enabled !== false,
    sticky: source.sticky !== false,
    items,
  };
}
export function normalizeInvitationModuleStyle(
  value: unknown,
): InvitationModuleStyle {
  const s = record(value);
  return {
    backgroundColor: color(s.backgroundColor),
    textColor: color(s.textColor),
    accentColor: color(s.accentColor),
    backgroundImage: invitationAssetUrl(s.backgroundImage),
    spacing:
      s.spacing === "compact" || s.spacing === "spacious"
        ? s.spacing
        : "comfortable",
    align: s.align === "center" ? "center" : "left",
  };
}
export function normalizeInvitationModuleSettings(
  value: unknown,
): InvitationModuleSettings {
  const s = record(value);
  return {
    mediaUrl: invitationAssetUrl(s.mediaUrl),
    posterUrl: invitationAssetUrl(s.posterUrl),
    effect:
      s.effect === "fade" || s.effect === "coverflow" || s.effect === "flip"
        ? s.effect
        : "slide",
    autoplay: s.autoplay === true,
    interval: num(s.interval, 5000, 3000, 15000),
    ratio:
      s.ratio === "4/3" || s.ratio === "1/1" || s.ratio === "3/4"
        ? s.ratio
        : "16/9",
    fit: s.fit === "cover" ? "cover" : "contain",
    layout: s.layout === "list" ? "list" : "grid",
    logoColumns: Math.round(num(s.logoColumns, 3, 2, 4)),
    logoHeight: Math.round(num(s.logoHeight, 56, 32, 96)),
    showOrganizationNames: s.showOrganizationNames !== false,
    agendaTitleSize: Math.round(num(s.agendaTitleSize, 14, 12, 24)),
    agendaMetaSize: Math.round(num(s.agendaMetaSize, 12, 10, 18)),
    agendaLineHeight: num(s.agendaLineHeight, 1.7, 1.2, 2.2),
    agendaWeight: Math.round(num(s.agendaWeight, 600, 400, 700) / 100) * 100,
    agendaPadding: Math.round(num(s.agendaPadding, 18, 8, 28)),
    agendaLayout:
      s.agendaLayout === "tabs" || s.agendaLayout === "continuous"
        ? s.agendaLayout
        : "auto",
    textPresentation:
      s.textPresentation === "prose" || s.textPresentation === "keywords"
        ? s.textPresentation
        : "auto",
    note: str(s.note, 2000),
    showNote: s.showNote !== false,
    latitude:
      typeof s.latitude === "number" &&
      Number.isFinite(s.latitude) &&
      Math.abs(s.latitude) <= 90
        ? s.latitude
        : null,
    longitude:
      typeof s.longitude === "number" &&
      Number.isFinite(s.longitude) &&
      Math.abs(s.longitude) <= 180
        ? s.longitude
        : null,
    zoom: Math.round(num(s.zoom, 15, 3, 18)),
    address: str(s.address, 300),
  };
}
export function normalizeInvitationPageDesign(
  value: unknown,
): InvitationPageDesign {
  const s = record(value);
  const fontUrl = invitationAssetUrl(s.fontUrl);
  return {
    textColor: color(s.textColor) || "#26362f",
    backgroundImage: invitationAssetUrl(s.backgroundImage),
    backgroundMotion:
      s.backgroundMotion === "pan" || s.backgroundMotion === "breathe"
        ? s.backgroundMotion
        : "none",
    backgroundOpacity: num(s.backgroundOpacity, 20, 5, 100),
    font: ["sans", "serif", "kai", "custom"].includes(String(s.font))
      ? (s.font as InvitationPageDesign["font"])
      : "default",
    fontUrl: /\.(woff2?|ttf|otf)(\?|$)/i.test(fontUrl) ? fontUrl : "",
    fontName: str(s.fontName, 80),
    replaceAllFonts: s.replaceAllFonts === true,
    bodySize: num(s.bodySize, 16, 12, 22),
  };
}
export function invitationLinkUrl(value: unknown): string {
  const url = str(value, 1500).trim();
  if (/^tel:[+\d][\d -]{2,30}$/.test(url)) return url;
  if (/^mailto:[^\s<>@]+@[^\s<>@]+$/.test(url)) return url;
  if (/^#invitation-[a-zA-Z0-9_-]+$/.test(url)) return url;
  return invitationAssetUrl(url).startsWith("https://")
    ? invitationAssetUrl(url)
    : "";
}
export function createInvitationModule(
  type: InvitationModuleType,
  id: string,
): InvitationModule {
  return {
    id,
    type,
    title: INVITATION_MODULE_LABELS[type],
    enabled: true,
    body: [],
    imageUrl: "",
    style: normalizeInvitationModuleStyle(null),
    settings: normalizeInvitationModuleSettings(null),
    items: [],
  };
}
export function invitationAssetUrl(value: unknown): string {
  const url = str(value, 1500).trim();
  if (
    /^\/invitation-art\/(?:(?:tide-paper|jade-paper|booklet-pattern)\.jpg|booklet-(?:cover|waves)\.png)$/.test(
      url,
    )
  )
    return url;
  if (
    /^\/uploads\/[A-Za-z0-9_./%\-]+$/.test(url) &&
    !/%2e|%2f|%5c|\.\./i.test(url)
  )
    return url;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}
export function createInvitationLayer(
  id: string,
  text = "{姓名}{称谓}",
): InvitationTextLayer {
  return {
    id,
    text,
    label: "受邀人",
    enabled: true,
    x: 10,
    y: 42,
    width: 36,
    height: 5,
    fontSize: 52,
    font: "serif",
    color: "#765925",
    bold: true,
    italic: false,
    underline: false,
    align: "center",
  };
}
export function normalizeInvitationCover(value: unknown): InvitationCover {
  const s = record(value),
    ids = new Set<string>();
  return {
    mode: s.mode === "artwork" ? "artwork" : "template",
    width: num(s.width, 1080, 100, 10000),
    height: num(s.height, 1920, 100, 20000),
    layers: (Array.isArray(s.layers) ? s.layers : [])
      .slice(0, 12)
      .map((item, i) => {
        const a = record(item),
          d = createInvitationLayer(`layer-${i}`);
        let id = str(a.id, 80) || d.id;
        while (ids.has(id)) id = `layer-${i}-${id}`;
        ids.add(id);
        const width = num(a.width, d.width, 2, 100),
          height = num(a.height, d.height, 1, 100);
        return {
          ...d,
          id,
          text: str(a.text, 500),
          label: str(a.label, 40) || "文字",
          enabled: a.enabled !== false,
          width,
          height,
          x: num(a.x, d.x, 0, 100 - width),
          y: num(a.y, d.y, 0, 100 - height),
          fontSize: num(a.fontSize, 52, 12, 240),
          font:
            a.font === "sans" || a.font === "kai" || a.font === "custom"
              ? a.font
              : "serif",
          color: /^#[a-f0-9]{6}$/i.test(str(a.color)) ? str(a.color) : d.color,
          bold: a.bold === true,
          italic: a.italic === true,
          underline: a.underline === true,
          align: a.align === "left" || a.align === "right" ? a.align : "center",
        };
      }),
  };
}
export function defaultInvitationModules(): InvitationModule[] {
  return (
    ["letter", "highlights", "agenda", "guests", "invitees", "venue"] as const
  ).map((type) => ({
    id: type,
    type,
    title: INVITATION_MODULE_LABELS[type],
    enabled: true,
    body: [],
    imageUrl: "",
  }));
}
export function normalizeInvitationModules(value: unknown): InvitationModule[] {
  if (!Array.isArray(value)) return defaultInvitationModules();
  const ids = new Set<string>(),
    types = new Set<string>();
  return value.slice(0, 24).flatMap((item, i) => {
    const s = record(item),
      type = str(s.type) as InvitationModuleType;
    if (
      !Object.prototype.hasOwnProperty.call(INVITATION_MODULE_LABELS, type) ||
      (types.has(type) && !invitationModuleRepeatable(type))
    )
      return [];
    types.add(type);
    let id = str(s.id, 80).replace(/[^a-zA-Z0-9_-]/g, "") || `module-${i}`;
    while (ids.has(id)) id = `module-${i}-${id}`;
    ids.add(id);
    return [
      {
        id,
        type,
        title: str(s.title, 80),
        enabled: s.enabled !== false,
        body: normalizeInvitationRichText(s.body),
        imageUrl: invitationAssetUrl(s.imageUrl),
        style: normalizeInvitationModuleStyle(s.style),
        settings: normalizeInvitationModuleSettings(s.settings),
        items: (Array.isArray(s.items) ? s.items : [])
          .slice(0, 20)
          .map((item, index) => {
            const a = record(item);
            return {
              id: `${id}-item-${index}`,
              title: str(a.title, 120),
              description: str(a.description, 2000),
              imageUrl: invitationAssetUrl(a.imageUrl),
              href: invitationLinkUrl(a.href),
              icon: INVITATION_ICONS.includes(
                a.icon as (typeof INVITATION_ICONS)[number],
              )
                ? String(a.icon)
                : "link",
              body: normalizeInvitationRichText(a.body),
            };
          }),
      },
    ];
  });
}
export function normalizeInvitationEffects(
  value: unknown,
  motion?: string,
): InvitationEffects {
  const s = record(value);
  return {
    entrance: ["rise", "fade", "unfold", "none"].includes(String(s.entrance))
      ? (s.entrance as InvitationEffects["entrance"])
      : motion === "none"
        ? "none"
        : "rise",
    cover: s.cover === "fade" || s.cover === "focus" ? s.cover : "none",
    scroll: s.scroll === "chapters" ? "chapters" : "continuous",
    duration: num(s.duration, 650, 200, 1200),
  };
}
const tags = new Set([
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
]);
export function invitationRichStyle(key: string, v: string): string {
  if (
    ["color", "background-color"].includes(key) &&
    /^(#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\)|black|white|red|blue|green|transparent)$/i.test(
      v,
    )
  )
    return v;
  if (key === "font-size" && /^\d+(\.\d+)?px$/.test(v))
    return `${Math.max(10, Math.min(72, parseFloat(v)))}px`;
  if (key === "font-family")
    return (
      (v === INVITATION_CUSTOM_FONT ? v : "") ||
      Object.values(INVITATION_FONTS).find(
        (font) =>
          font.family.replace(/["'\s]/g, "").toLowerCase() ===
          v.replace(/["'\s]/g, "").toLowerCase(),
      )?.family ||
      ""
    );
  if (
    key === "text-align" &&
    ["left", "center", "right", "justify"].includes(v)
  )
    return v;
  if (key === "font-weight" && /^(normal|bold|[1-9]00)$/.test(v)) return v;
  if (key === "font-style" && ["normal", "italic"].includes(v)) return v;
  if (
    key === "text-decoration" &&
    /^(underline|line-through|none)( (underline|line-through))?$/.test(v)
  )
    return v;
  if (key === "line-height" && /^(1|1\.5|1\.75|2|2\.5|3)$/.test(v)) return v;
  return "";
}
export function normalizeInvitationRichText(
  value: unknown,
): InvitationRichNode[] {
  let remaining = 60000,
    count = 0;
  function visit(nodes: unknown, depth: number): InvitationRichNode[] {
    if (!Array.isArray(nodes) || depth > 16) return [];
    return nodes.slice(0, 1500).flatMap((item): InvitationRichNode[] => {
      if (++count > 4000 || remaining <= 0) return [];
      const s = record(item);
      if (typeof s.text === "string") {
        const text = s.text.slice(0, remaining);
        remaining -= text.length;
        return [{ text }];
      }
      const tag = str(s.tag, 20).toLowerCase();
      if (!tags.has(tag)) return [];
      const a = record(s.attrs),
        attrs: Record<string, string> = {};
      if (tag === "a") {
        const href = invitationAssetUrl(a.href);
        if (href.startsWith("https://")) {
          attrs.href = href;
          attrs.target = "_blank";
          attrs.rel = "noopener noreferrer";
        }
      }
      if (tag === "img") {
        const src = invitationAssetUrl(a.src);
        if (!src) return [];
        attrs.src = src;
        attrs.alt = str(a.alt, 200);
      }
      // Rebuild declarations from a strict allowlist; raw HTML never reaches the renderer.
      if (typeof a.style === "string") {
        const safe = a.style
          .split(";")
          .map((part) => {
            const [key, ...v] = part.split(":");
            return [
              key.trim(),
              invitationRichStyle(key.trim(), v.join(":").trim()),
            ];
          })
          .filter(([, v]) => v);
        if (safe.length)
          attrs.style = safe.map(([k, v]) => `${k}:${v}`).join(";");
      }
      return [
        {
          tag,
          attrs,
          children: ["img", "br", "hr"].includes(tag)
            ? []
            : visit(s.children, depth + 1),
        },
      ];
    });
  }
  return visit(value, 0);
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function invitationRichTextHtml(
  value: unknown,
  uploadOrigin = "",
): string {
  const origin =
    /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[^/?#]+)$/.test(
      uploadOrigin,
    )
      ? uploadOrigin
      : "";
  function html(nodes: InvitationRichNode[]): string {
    return nodes
      .map((node) => {
        if ("text" in node) return escapeHtml(node.text);
        const attrs = Object.entries(node.attrs)
          .map(
            ([key, v]) =>
              ` ${key}="${escapeHtml(key === "src" && v.startsWith("/uploads/") ? origin + v : v)}"`,
          )
          .join("");
        return `<${node.tag}${attrs}>${["br", "hr", "img"].includes(node.tag) ? "" : html(node.children) + `</${node.tag}>`}`;
      })
      .join("");
  }
  return html(normalizeInvitationRichText(value));
}
