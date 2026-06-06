import { request } from "./request";

export interface ConferenceListItem {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  summary: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
}

export interface RegistrationSku {
  id: string;
  name: string;
  description: string | null;
  priceCent: number;
  stock: number;
  soldCount: number;
}

export interface ConferenceDetail extends ConferenceListItem {
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  contentJson: unknown;
  skus: RegistrationSku[];
}

export type FormFieldType = "text" | "textarea" | "phone" | "email" | "select" | "radio" | "checkbox" | "date";

export interface FormOption {
  label: string;
  value: string;
}

export interface FormField {
  id: string;
  key: string;
  label: string;
  type: FormFieldType | string;
  required: boolean;
  placeholder: string | null;
  options: Array<string | FormOption>;
  validationJson: unknown;
  sortOrder: number;
}

export interface ConferenceForm {
  formId: string;
  title: string | null;
  description: string | null;
  fields: FormField[];
}

export async function getConferences(): Promise<ConferenceListItem[]> {
  const data = await request<{ items: ConferenceListItem[] }>("/conferences");
  return data.items;
}

export function getConferenceDetail(id: string): Promise<ConferenceDetail> {
  return request<ConferenceDetail>(`/conferences/${encodeURIComponent(id)}`);
}

export function getConferenceForm(id: string): Promise<ConferenceForm> {
  return request<ConferenceForm>(`/conferences/${encodeURIComponent(id)}/form`);
}

export function normalizeOptions(options: Array<string | FormOption>): FormOption[] {
  return options
    .map((option) => {
      if (typeof option === "string") {
        return { label: option, value: option };
      }

      return {
        label: option.label || option.value,
        value: option.value || option.label
      };
    })
    .filter((option) => option.value);
}
