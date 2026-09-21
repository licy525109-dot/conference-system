import type { WechatProfileSummary } from "./wechatProfilePrompt";
import { isWechatProfileComplete } from "./wechatProfilePrompt";

export type AttendeeAnswers = Record<string, string | string[]>;
export interface ReusableIdentity {
  name: string;
  phone: string;
  company?: string | null;
  title?: string | null;
  formDataJson?: Record<string, unknown> | null;
  registration?: { conferenceId: string } | null;
}

export function registrationProfileReady(profile: (WechatProfileSummary & { registrationReady?: boolean }) | null | undefined): boolean {
  return isWechatProfileComplete(profile) && profile?.registrationReady !== false;
}

export function attendeeMatchesSelf(answers: AttendeeAnswers, profile: WechatProfileSummary | null | undefined): boolean {
  return isWechatProfileComplete(profile)
    && typeof answers.name === "string" && answers.name.trim() === profile?.realName?.trim()
    && typeof answers.phone === "string" && answers.phone.trim() === profile?.phone?.trim();
}

export function reuseAttendeeAnswers(
  fields: ReadonlyArray<{ key: string; type: string }>,
  conferenceId: string,
  identity: ReusableIdentity
): AttendeeAnswers {
  const common: Record<string, unknown> = {
    name: identity.name, phone: identity.phone, company: identity.company,
    title: identity.title, position: identity.title
  };
  const previous = identity.registration?.conferenceId === conferenceId ? identity.formDataJson ?? {} : {};
  return Object.fromEntries(fields.map(field => {
    const value = common[field.key] ?? previous[field.key];
    // Reuse configured answer keys only, never original identity metadata or foreign-conference answers.
    return [field.key, typeof value === "string" ? value
      : Array.isArray(value) && value.every(item => typeof item === "string") ? [...value]
      : field.type.toLowerCase() === "checkbox" ? [] : ""];
  }));
}

export function preserveQuantities(
  skus: ReadonlyArray<{ id: string }>, selectedSkuId: string,
  existing: Record<string, number>, initialized: boolean
): Record<string, number> {
  return Object.fromEntries(skus.map(sku => [sku.id, initialized ? existing[sku.id] ?? 0 : Number(sku.id === selectedSkuId)]));
}
