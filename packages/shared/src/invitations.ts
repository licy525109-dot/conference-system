import {
  normalizeInvitationCover,
  normalizeInvitationModules,
  normalizeInvitationEffects,
  type InvitationCover,
  type InvitationModule,
  type InvitationEffects,
  normalizeInvitationPageDesign,
  type InvitationPageDesign,
  normalizeInvitationNavigation,
  type InvitationNavigation,
  INVITATION_MODULE_LABELS,
  invitationAssetUrl,
  invitationLinkUrl,
  type InvitationModuleItem,
} from "./invitation-design";
export * from "./invitation-design";
export type InvitationTheme = "forest" | "ceremony" | "coral";
export interface InvitationAgendaItem {
  id: string;
  date: string;
  time: string;
  title: string;
  speaker: string;
  location: string;
  imageUrl?: string;
}
export interface InvitationGuest {
  id: string;
  name: string;
  organization: string;
  role: string;
  imageUrl: string;
  status: "INVITED" | "CONFIRMED";
  biography?: string;
}
export interface InvitationInvitee {
  id: string;
  name: string;
  organization: string;
  role?: string;
}
export interface InvitationRegistration {
  mode: "miniapp" | "external" | "none";
  conferenceId: string;
  url: string;
  label: string;
}
export function invitationRegistrationUrl(input: unknown): string {
  if (typeof input !== "string" || input.length > 2000) return "";
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function normalizeInvitationRegistration(
  input: unknown,
): InvitationRegistration {
  const source = object(input);
  return {
    mode:
      source.mode === "external" || source.mode === "none"
        ? source.mode
        : "miniapp",
    conferenceId: string(source.conferenceId, 100),
    url: invitationRegistrationUrl(source.url),
    label: string(source.label, 24),
  };
}
export interface InvitationContent {
  version: 1;
  title: string;
  subtitle: string;
  host: string;
  introduction: string;
  dateLabel: string;
  location: string;
  address: string;
  contactName: string;
  contactPhone: string;
  coverImageUrl: string;
  logoUrl: string;
  theme: InvitationTheme;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  heroPosition: "center" | "top" | "bottom";
  heroTextColor: string;
  heroOverlayOpacity: number;
  headingFont: "serif" | "sans";
  heroLayout: "immersive" | "poster";
  visualPreset: "custom" | "tide" | "jade" | "editorial" | "booklet";
  motion: "elegant" | "none";
  cover: InvitationCover;
  modules: InvitationModule[];
  effects: InvitationEffects;
  design?: InvitationPageDesign;
  navigation?: InvitationNavigation;
  inviteeSort?: InvitationRosterSort;
  shareTitle: string;
  shareDescription: string;
  shareImageUrl: string;
  agenda: InvitationAgendaItem[];
  guests: InvitationGuest[];
  invitees: InvitationInvitee[];
  highlights: Array<{ id: string; title: string; description: string }>;
  organizers: string[];
  registration?: InvitationRegistration;
}
export const INVITATION_THEMES: Record<
  InvitationTheme,
  {
    name: string;
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
  }
> = {
  forest: {
    name: "山野青绿",
    primaryColor: "#214c40",
    accentColor: "#aa4740",
    backgroundColor: "#f5f7f3",
  },
  ceremony: {
    name: "典礼金红",
    primaryColor: "#765925",
    accentColor: "#9d3545",
    backgroundColor: "#faf8f2",
  },
  coral: {
    name: "珊瑚朱红",
    primaryColor: "#a83449",
    accentColor: "#17676b",
    backgroundColor: "#fff7f6",
  },
};
export function createInvitationContent(conference?: {
  title?: string;
  coverImageUrl?: string | null;
  location?: string | null;
  startsAt?: string | Date;
  endsAt?: string | Date;
}): InvitationContent {
  return {
    version: 1,
    title: conference?.title || "",
    subtitle: "",
    host: "观潮会集",
    introduction: "诚邀您莅临，与同行相聚，共话行业新方向。期待与您相见。",
    dateLabel: conference?.startsAt
      ? new Date(conference.startsAt).toLocaleDateString("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
    location: conference?.location || "",
    address: "",
    contactName: "",
    contactPhone: "",
    coverImageUrl: conference?.coverImageUrl || "",
    logoUrl: "",
    theme: "forest",
    primaryColor: INVITATION_THEMES.forest.primaryColor,
    accentColor: INVITATION_THEMES.forest.accentColor,
    backgroundColor: INVITATION_THEMES.forest.backgroundColor,
    heroPosition: "center",
    heroTextColor: "#ffffff",
    heroOverlayOpacity: 55,
    headingFont: "serif",
    heroLayout: "immersive",
    visualPreset: "custom",
    motion: "elegant",
    cover: normalizeInvitationCover(null),
    modules: normalizeInvitationModules(null),
    effects: normalizeInvitationEffects(null),
    design: normalizeInvitationPageDesign(null),
    inviteeSort: normalizeInvitationRosterSort(null),
    shareTitle: "{姓名}专属邀请函",
    shareDescription: "一封专属于您的邀请，期待与您相见。",
    shareImageUrl: "",
    agenda: [],
    guests: [],
    invitees: [],
    highlights: [],
    organizers: [],
    registration: normalizeInvitationRegistration(null),
  };
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown, limit = 200): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
export function invitationImageUrl(value: unknown): string {
  const url = string(value, 1500);
  if (!url) return "";
  if (url.startsWith("/invitation-art/")) return invitationAssetUrl(url);
  if (/^\/uploads\/[A-Za-z0-9_./%\-]+$/.test(url) && !url.includes(".."))
    return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}
export function normalizeInvitationContent(input: unknown): InvitationContent {
  const source = object(input);
  const defaults = createInvitationContent();
  const result = { ...defaults };
  for (const key of [
    "title",
    "subtitle",
    "host",
    "dateLabel",
    "location",
    "address",
    "contactName",
    "contactPhone",
    "shareTitle",
    "shareDescription",
  ] as const)
    result[key] = string(source[key], key === "shareDescription" ? 300 : 200);
  result.introduction = string(source.introduction, 10000);
  result.registration = normalizeInvitationRegistration(source.registration);
  result.theme =
    source.theme === "ceremony" || source.theme === "coral"
      ? source.theme
      : "forest";
  for (const key of ["primaryColor", "accentColor", "backgroundColor"] as const)
    result[key] = /^#[a-fA-F0-9]{6}$/.test(string(source[key]))
      ? string(source[key])
      : INVITATION_THEMES[result.theme][key];
  for (const key of ["coverImageUrl", "logoUrl", "shareImageUrl"] as const)
    result[key] = invitationImageUrl(source[key]);
  result.heroPosition =
    source.heroPosition === "top" || source.heroPosition === "bottom"
      ? source.heroPosition
      : "center";
  result.headingFont = source.headingFont === "sans" ? "sans" : "serif";
  result.heroTextColor = /^#[a-fA-F0-9]{6}$/.test(string(source.heroTextColor))
    ? string(source.heroTextColor)
    : defaults.heroTextColor;
  result.heroOverlayOpacity =
    typeof source.heroOverlayOpacity === "number" &&
    Number.isFinite(source.heroOverlayOpacity)
      ? Math.max(0, Math.min(80, Math.round(source.heroOverlayOpacity)))
      : defaults.heroOverlayOpacity;
  result.heroLayout = source.heroLayout === "poster" ? "poster" : "immersive";
  result.visualPreset = ["tide", "jade", "editorial", "booklet"].includes(
    String(source.visualPreset),
  )
    ? (source.visualPreset as InvitationContent["visualPreset"])
    : "custom";
  result.motion = source.motion === "none" ? "none" : "elegant";
  result.cover = normalizeInvitationCover(source.cover);
  result.modules = normalizeInvitationModules(source.modules);
  result.navigation = normalizeInvitationNavigation(
    source.navigation,
    result.modules,
  );
  result.effects = normalizeInvitationEffects(source.effects, result.motion);
  result.design = normalizeInvitationPageDesign(source.design);
  result.inviteeSort = normalizeInvitationRosterSort(source.inviteeSort);
  const items = (key: string, limit: number) =>
    (Array.isArray(source[key]) ? (source[key] as unknown[]) : [])
      .slice(0, limit)
      .map(object);
  result.agenda = items("agenda", 150).map((item, i) => ({
    id: string(item.id, 80) || `agenda-${i}`,
    date: string(item.date, 50),
    time: string(item.time, 50),
    title: string(item.title, 300),
    speaker: string(item.speaker, 200),
    location: string(item.location, 200),
    imageUrl: invitationImageUrl(item.imageUrl),
  }));
  result.guests = items("guests", 100).map((item, i) => ({
    id: string(item.id, 80) || `guest-${i}`,
    name: string(item.name, 80),
    organization: string(item.organization),
    role: string(item.role),
    imageUrl: invitationImageUrl(item.imageUrl),
    status: item.status === "CONFIRMED" ? "CONFIRMED" : "INVITED",
    biography: string(item.biography, 10000),
  }));
  result.invitees = items("invitees", 500).map((item, i) => ({
    id: string(item.id, 80) || `invitee-${i}`,
    name: string(item.name, 80),
    organization: string(item.organization),
    role: string(item.role, 100),
  }));
  result.highlights = items("highlights", 12).map((item, i) => ({
    id: string(item.id, 80) || `highlight-${i}`,
    title: string(item.title),
    description: string(item.description, 1000),
  }));
  result.organizers = (
    Array.isArray(source.organizers) ? source.organizers : []
  )
    .slice(0, 30)
    .map((item) => string(item))
    .filter(Boolean);
  return result;
}
export interface PublicInvitation {
  recipient: {
    name: string;
    salutation: string;
    publicInviteeId?: string | null;
  };
  conferenceId: string | null;
  revision: number;
  publishedAt: string;
  content: InvitationContent;
  shareUrl: string;
  registrationPath: string;
  registrationOpen: boolean;
  registrationMessage: string;
  miniAppId: string;
  registrationMode?: InvitationRegistration["mode"];
  registrationUrl?: string;
}
export interface InvitationCampaignSummary {
  id: string;
  conferenceId: string | null;
  title: string;
  publishedRevision: number;
  draftRevision: number;
  publishedAt: string | null;
  hasChanges: boolean;
}
export interface InvitationRecord {
  id: string;
  name: string;
  publicInviteeId?: string | null;
  salutation: string;
  enabled: boolean;
  shareUrl: string;
  createdAt: string;
  createdBy: string;
  creator: { displayName: string | null; username: string };
  registrationCount: number;
}

export const INVITATION_PRESETS = [
  {
    id: "booklet",
    name: "观潮·会议长卷",
    image: "/invitation-art/booklet-cover.png",
    theme: "ceremony",
    primaryColor: "#8b6b3d",
    accentColor: "#a33236",
    backgroundColor: "#fffef5",
    headingFont: "sans",
  },
  {
    id: "tide",
    name: "潮汐朱红",
    image: "/invitation-art/tide-paper.jpg",
    theme: "coral",
    primaryColor: "#a52b26",
    accentColor: "#42726e",
    backgroundColor: "#f5f5f3",
    headingFont: "serif",
  },
  {
    id: "jade",
    name: "山水青玉",
    image: "/invitation-art/jade-paper.jpg",
    theme: "forest",
    primaryColor: "#205b4b",
    accentColor: "#aa473c",
    backgroundColor: "#f2f6f3",
    headingFont: "serif",
  },
  {
    id: "editorial",
    name: "当代艺文",
    image: "/invitation-art/tide-paper.jpg",
    theme: "coral",
    primaryColor: "#282c32",
    accentColor: "#af302c",
    backgroundColor: "#f4f5f7",
    headingFont: "sans",
  },
] as const;

export function invitationVenueItems(
  content: InvitationContent,
  module: InvitationModule,
): InvitationModuleItem[] {
  if (module.settings?.venueMode === "custom")
    return (module.items || [])
      .map((item) => ({ ...item, href: invitationLinkUrl(item.href) }))
      .filter((item) => item.description.trim() || item.href);
  const presented = new Set(
    content.modules
      .filter((item) => item.type === "organizations" && item.enabled)
      .flatMap((item) => (item.items || []).map((unit) => unit.description)),
  );
  const organizers = content.organizers.filter((name) => !presented.has(name));
  return [
    { title: "时间", description: content.dateLabel, icon: "calendar" },
    {
      title: "地点",
      description: [content.location, content.address]
        .filter(Boolean)
        .join("\n"),
      icon: "location",
    },
    {
      title: "会务",
      description: [content.contactName, content.contactPhone]
        .filter(Boolean)
        .join("\n"),
      icon: "phone",
      href: invitationLinkUrl(
        `tel:${content.contactPhone.replace(/[^+\d]/g, "")}`,
      ),
    },
    { title: "组织单位", description: organizers.join("\n"), icon: "document" },
  ]
    .filter((item) => item.description.trim())
    .map((item, index) => ({
      id: `${module.id}-meeting-${index}`,
      imageUrl: "",
      body: [],
      href: "",
      ...item,
    }));
}

export function invitationVisibleModules(
  content: InvitationContent,
): InvitationModule[] {
  return normalizeInvitationModules(content.modules).filter((module) => {
    if (!module.enabled) return false;
    if (module.type === "letter")
      return Boolean(module.body.length || content.introduction.trim());
    if (module.type === "richtext") return module.body.length > 0;
    if (module.type === "image") return Boolean(module.imageUrl);
    if (module.type === "video" || module.type === "audio")
      return Boolean(module.settings?.mediaUrl);
    if (module.type === "carousel")
      return Boolean(module.items?.some((item) => item.imageUrl));
    if (module.type === "tabs") return Boolean(module.items?.length);
    if (module.type === "links")
      return Boolean(module.items?.some((item) => item.href));
    if (module.type === "map")
      return Boolean(
        module.settings?.address ||
          (module.settings?.latitude != null &&
            module.settings?.longitude != null),
      );
    if (module.type === "search") return true;
    if (module.type === "contacts")
      return Boolean(
        module.contacts?.some((contact) =>
          [
            contact.name,
            contact.role,
            contact.phone,
            contact.wechat,
            contact.note,
            contact.imageUrl,
          ].some((value) => value.trim()),
        ),
      );
    if (module.type === "organizations")
      return Boolean(
        module.items?.some((item) => item.description || item.imageUrl) ||
          (module.settings?.organizationLayout === "canvas" &&
            module.organizationCanvas?.labels.some(
              (label) => label.enabled && label.text.trim(),
            )),
      );
    if (module.type === "invitees" && content.visualPreset === "booklet")
      return true;
    if (module.type === "venue") {
      if (module.settings?.venueMode === "custom")
        return invitationVenueItems(content, module).length > 0;
      return Boolean(
        content.dateLabel ||
          content.location ||
          content.address ||
          content.contactName ||
          content.contactPhone ||
          content.organizers.length,
      );
    }
    return content[module.type].length > 0;
  });
}
export function invitationNavigationLinks(
  content: InvitationContent,
): Array<{ module: InvitationModule; label: string }> {
  const navigation = normalizeInvitationNavigation(
    content.navigation,
    normalizeInvitationModules(content.modules),
  );
  if (!navigation.enabled) return [];
  const modules = new Map(
    invitationVisibleModules(content).map((module) => [module.id, module]),
  );
  return navigation.items.flatMap((item) => {
    const module = modules.get(item.moduleId);
    return item.visible && module
      ? [
          {
            module,
            label:
              item.label ||
              module.title ||
              INVITATION_MODULE_LABELS[module.type],
          },
        ]
      : [];
  });
}

export function applyInvitationPreset(
  content: InvitationContent,
  id: string,
): InvitationContent {
  const preset = INVITATION_PRESETS.find((item) => item.id === id);
  if (!preset) return content;
  return {
    ...content,
    visualPreset: preset.id,
    theme: preset.theme,
    primaryColor: preset.primaryColor,
    accentColor: preset.accentColor,
    backgroundColor: preset.backgroundColor,
    headingFont: preset.headingFont,
    coverImageUrl: preset.image,
    heroLayout: "immersive",
    heroPosition: "center",
    heroTextColor: preset.id === "booklet" ? "#292a2c" : "#26322f",
    heroOverlayOpacity: 0,
    motion: "elegant",
  };
}

export function invitationNameKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}
export interface InvitationRosterSort {
  key: "manual" | "name" | "organization" | "role";
  direction: "asc" | "desc";
}
export function normalizeInvitationRosterSort(
  value: unknown,
): InvitationRosterSort {
  const s = object(value);
  return {
    key:
      s.key === "name" || s.key === "organization" || s.key === "role"
        ? s.key
        : "manual",
    direction: s.direction === "desc" ? "desc" : "asc",
  };
}
export function sortInvitationInvitees(
  rows: InvitationInvitee[],
  value?: InvitationRosterSort,
): InvitationInvitee[] {
  const sort = normalizeInvitationRosterSort(value);
  if (sort.key === "manual") return [...rows];
  const key = sort.key;
  const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = a.row[key] || "",
        bv = b.row[key] || "";
      if (!av || !bv) return Number(!av) - Number(!bv) || a.index - b.index;
      return (
        collator.compare(av, bv) * (sort.direction === "desc" ? -1 : 1) ||
        a.index - b.index
      );
    })
    .map(({ row }) => row);
}
export function matchInvitationInvitee(
  rows: InvitationInvitee[],
  recipient: PublicInvitation["recipient"],
) {
  const candidates = rows.filter(
    (row) => invitationNameKey(row.name) === invitationNameKey(recipient.name),
  );
  if (recipient.publicInviteeId) {
    const selected = candidates.find(
      (row) => row.id === recipient.publicInviteeId,
    );
    return {
      status: selected ? ("matched" as const) : ("missing" as const),
      item: selected,
      candidates,
    };
  }
  return {
    status:
      candidates.length === 1
        ? ("matched" as const)
        : candidates.length > 1
          ? ("ambiguous" as const)
          : ("missing" as const),
    item: candidates.length === 1 ? candidates[0] : undefined,
    candidates,
  };
}
export function resolveInvitationText(
  template: string,
  recipient: PublicInvitation["recipient"],
  conferenceTitle: string,
): string {
  const values: Record<string, string> = {
    姓名: recipient.name,
    称谓: recipient.salutation,
    会议名称: conferenceTitle,
  };
  return template.replace(
    /\{(姓名|称谓|会议名称)\}/g,
    (_, key: string) => values[key] || "",
  );
}
export function invitationShare(
  document: Pick<PublicInvitation, "content" | "recipient" | "shareUrl">,
) {
  return {
    title: resolveInvitationText(
      document.content.shareTitle || "{姓名}专属邀请函",
      document.recipient,
      document.content.title,
    ),
    description: resolveInvitationText(
      document.content.shareDescription,
      document.recipient,
      document.content.title,
    ),
    imageUrl: document.content.shareImageUrl || document.content.coverImageUrl,
    url: document.shareUrl,
  };
}
