export interface ApiList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
}

export interface Conference {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  coverImage: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  sortOrder: number;
  contentJson?: Record<string, unknown>;
  styleJson?: Record<string, unknown> | null;
  counts?: {
    skus: number;
    orders: number;
    registrations: number;
  };
}

export interface Sku {
  id: string;
  conferenceId: string;
  name: string;
  description: string | null;
  priceCent: number;
  stock: number;
  soldCount: number;
  status: "ACTIVE" | "INACTIVE";
  saleStartAt: string | null;
  saleEndAt: string | null;
  sortOrder: number;
}

export interface FormField {
  id: string;
  label: string;
  fieldKey: string;
  type: "TEXT" | "TEXTAREA" | "PHONE" | "EMAIL" | "SELECT" | "RADIO" | "CHECKBOX" | "DATE";
  required: boolean;
  placeholder: string | null;
  optionsJson: unknown[] | null;
  validationJson: Record<string, unknown> | null;
  sortOrder: number;
  enabled: boolean;
}

export interface AdminOrder {
  id: string;
  orderNo: string;
  conferenceId: string;
  conferenceTitle: string;
  skuId: string;
  skuName: string;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  attendeeName: string | null;
  phone: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminRegistration {
  id: string;
  registrationNo: string;
  conferenceTitle: string;
  skuName: string;
  attendeeName: string;
  phone: string;
  paidAmountCent: number;
  status: string;
  orderNo: string;
  confirmedAt: string;
  createdAt: string;
}
