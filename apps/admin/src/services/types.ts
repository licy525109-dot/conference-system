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
  checkInEnabled: boolean;
  groupRegistrationEnabled: boolean;
  maxTicketsPerOrder: number | null;
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

export interface AdminWechatUser {
  id: string;
  openid: string | null;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
  registeredAt: string;
  lastActiveAt: string | null;
}

export interface AdminPayment {
  id?: string;
  provider: string;
  status: string;
  outTradeNo: string;
  transactionId: string | null;
  amountCent?: number;
  paidAt?: string | null;
  createdAt?: string;
}

export interface AdminOrder {
  id: string;
  orderNo: string;
  conferenceId: string;
  conferenceTitle: string;
  skuId: string;
  skuName: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  paymentStatus: string | null;
  paymentProvider: string | null;
  outTradeNo: string | null;
  transactionId: string | null;
  user: AdminWechatUser | null;
  attendeeName: string | null;
  phone: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrder {
  submittedFormJson: Record<string, unknown>;
  registrationSnapshotJson: Record<string, unknown> | null;
  items: Array<{
    id: string;
    skuName: string;
    unitPriceCent: number;
    quantity: number;
    totalAmountCent: number;
  }>;
  discounts: AdminOrderDiscount[];
  payments: AdminPayment[];
  registration: {
    id: string;
    registrationNo: string;
    status: string;
  } | null;
}

export interface AdminOrderDiscount {
  id: string;
  type: "FULL_REDUCTION" | "COUPON";
  title: string;
  amountCent: number;
  couponId: string | null;
  promotionRuleId: string | null;
  snapshotJson: Record<string, unknown> | null;
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
  user: AdminWechatUser | null;
  orderNo: string;
  confirmedAt: string;
  adminRemark: string | null;
  remarkUpdatedAt: string | null;
  remarkUpdatedBy: string | null;
  attendeeCount: number;
  checkInProgress: {
    total: number;
    checkedIn: number;
    pending: number;
    notRequired: number;
  };
  createdAt: string;
}

export interface AdminRegistrationDetail extends AdminRegistration {
  formDataJson: Record<string, unknown>;
  attendees: AdminRegistrationAttendee[];
  order: {
    orderNo: string;
    status: string;
    payableAmountCent: number;
    paidAmountCent: number | null;
    paidAt: string | null;
    payments: AdminPayment[];
  };
}

export interface AdminRegistrationAttendee {
  id: string;
  skuId: string;
  skuName: string;
  name: string;
  phone: string;
  company: string | null;
  title: string | null;
  formDataJson: Record<string, unknown> | null;
  checkInStatus: "NOT_REQUIRED" | "PENDING" | "CHECKED_IN" | "CANCELLED";
  checkedInAt: string | null;
  checkedInBy: string | null;
  adminRemark: string | null;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  type: "AMOUNT" | "PERCENT";
  discountAmountCent: number | null;
  discountPercent: number | null;
  maxDiscountCent: number | null;
  minAmountCent: number | null;
  minQuantity: number | null;
  totalLimit: number | null;
  perUserLimit: number | null;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  stackableWithPromotion: boolean;
  conferenceId: string | null;
  allowedSkuIds: string[];
  redemptionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionRule {
  id: string;
  name: string;
  type: "FULL_REDUCTION";
  conferenceId: string | null;
  allowedSkuIds: string[];
  minAmountCent: number | null;
  minQuantity: number | null;
  discountAmountCent: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  stackableWithCoupon: boolean;
  createdAt: string;
  updatedAt: string;
}
