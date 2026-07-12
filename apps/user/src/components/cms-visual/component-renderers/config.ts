import type { CmsComponent } from "@/services/cms";

export interface CmsEntryItem {
  id: string;
  enabled: boolean;
  sort: number;
  title: string;
  subtitle: string;
  iconUrl: string;
  dynamicIconUrl: string;
  builtinIcon: string;
  backgroundColor: string;
  textColor: string;
  cardStyle: string;
}

export interface CmsStatItem {
  id: string;
  value: string;
  label: string;
}

export function stringConfig(component: CmsComponent, key: string, fallback = ""): string {
  const value = component.config?.[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export function numberConfig(component: CmsComponent, key: string, fallback: number): number {
  const value = Number(component.config?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function booleanConfig(component: CmsComponent, key: string, fallback: boolean): boolean {
  const value = component.config?.[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

export function stringListConfig(component: CmsComponent, key: string): string[] {
  const value = component.config?.[key];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export function normalizeStats(component: CmsComponent, userContext?: Record<string, unknown> | null): CmsStatItem[] {
  if (stringConfig(component, "dataSource") === "current-user") {
    return [
      { id: "registrations", value: contextCount(userContext, "registrationCount"), label: "我的报名" },
      { id: "orders", value: contextCount(userContext, "orderCount"), label: "我的订单" },
      { id: "pending", value: contextCount(userContext, "pendingConferenceCount"), label: "待参会" },
      { id: "coupons", value: contextCount(userContext, "couponCount"), label: "优惠券" }
    ];
  }

  return stringListConfig(component, "items").map((item, index) => {
    const [value, ...labelParts] = item.split(/[｜|]/).map((part) => part.trim());
    if (labelParts.length > 0) return { id: `stat-${index}`, value: value || "0", label: labelParts.join(" · ") };
    const match = item.match(/^([^\s]+)\s+(.+)$/);
    return {
      id: `stat-${index}`,
      value: match?.[1] || item,
      label: match?.[2] || ""
    };
  });
}

function contextCount(context: Record<string, unknown> | null | undefined, key: string): string {
  const value = context?.[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(numeric) ? String(numeric) : "0";
}
