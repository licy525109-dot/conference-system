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
  permissions?: string[];
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

export interface PaymentExceptionItem {
  code: string;
  level: "warning" | "danger";
  message: string;
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
  paymentExceptions: PaymentExceptionItem[];
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
  exceptionReviewLogs: Array<{
    id: string;
    summary: string | null;
    metadataJson: Record<string, unknown> | null;
    adminName: string;
    createdAt: string;
  }>;
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
    id?: string;
    orderNo: string;
    status: string;
    originAmountCent?: number;
    discountAmountCent?: number;
    payableAmountCent: number;
    paidAmountCent: number | null;
    submittedFormJson?: Record<string, unknown>;
    registrationSnapshotJson?: Record<string, unknown> | null;
    createdAt?: string;
    paidAt: string | null;
    items?: Array<{
      id: string;
      skuName: string;
      unitPriceCent: number;
      quantity: number;
      totalAmountCent: number;
    }>;
    discounts?: AdminOrderDiscount[];
    payments: AdminPayment[];
  };
}

export interface AdminRegistrationAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  metadataJson: Record<string, unknown> | null;
  adminName: string;
  createdAt: string;
}

export interface AdminRegistrationTimelineItem {
  type: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface AdminRegistrationFullDetail extends AdminRegistrationDetail {
  credential: {
    registrationNo: string;
    credentialCode: string;
    qrPayload: string;
    checkInProgress: AdminRegistration["checkInProgress"];
  };
  auditLogs: AdminRegistrationAuditLog[];
  timeline: AdminRegistrationTimelineItem[];
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

export interface AdminAuditLog {
  id: string;
  adminId: string | null;
  adminName: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "SYSTEM" | string;
  targetType: string;
  targetId: string | null;
  summary: string | null;
  metadataJson: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
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

export interface CouponCampaign {
  id: string;
  conferenceId: string | null;
  conferenceTitle?: string | null;
  name: string;
  claimCode: string;
  qrScene: string;
  enabled: boolean;
  totalLimit: number | null;
  claimedCount: number;
  startAt: string | null;
  endAt: string | null;
  coupons: Array<{ id: string; code: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CouponCampaignQr {
  id: string;
  claimCode: string;
  qrScene: string;
  path: string;
  qrPayload: string;
}

export type NotificationChannelType = "MOCK" | "WECHAT_SUBSCRIBE" | "SMS";
export type NotificationTemplateStatus = "DRAFT" | "ACTIVE" | "DISABLED";
export type NotificationTaskStatus = "DRAFT" | "PENDING" | "SENDING" | "SENT" | "PARTIAL_FAILED" | "FAILED" | "CANCELLED" | "SKIPPED";
export type NotificationLogStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannelType;
  status: NotificationTemplateStatus;
  title: string | null;
  templateKey: string | null;
  contentJson: Record<string, unknown>;
  remark: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTask {
  id: string;
  name: string;
  templateId: string;
  channel: NotificationChannelType;
  targetType: string;
  payloadJson: Record<string, unknown> | null;
  status: NotificationTaskStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  template?: {
    id: string;
    code: string;
    name: string;
    title: string | null;
  };
  logCount: number;
}

export interface NotificationLog {
  id: string;
  taskId: string | null;
  templateId: string | null;
  userId: string | null;
  channel: NotificationChannelType;
  recipient: string | null;
  status: NotificationLogStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: Record<string, unknown> | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  task?: {
    id: string;
    name: string;
  } | null;
  template?: {
    id: string;
    code: string;
    name: string;
  } | null;
  user?: {
    id: string;
    openid: string | null;
    wechatNickname: string | null;
    nickname: string | null;
  } | null;
}

export interface NotificationChannelConfig {
  channel: NotificationChannelType;
  enabled: boolean;
  envKey: string;
  statusText: string;
  secretVisible: false;
  templates: Array<{
    id: string;
    code: string;
    name: string;
    status: NotificationTemplateStatus;
    templateKey: string | null;
    hasTemplateKey: boolean;
    updatedAt: string;
  }>;
}

export interface DashboardOverview {
  cards: {
    todayRevenueCent: number;
    totalRevenueCent: number;
    todayOrders: number;
    createdOrders?: number;
    successfulPayments?: number;
    paidOrders: number;
    pendingOrders: number;
    todayRegistrations: number;
    totalRegistrations: number;
    abnormalOrders?: number;
    refundAmountCent?: number;
    invoiceApplicationCount?: number;
    checkedInCount: number;
    pendingCheckInCount: number;
    couponUsedCount: number;
    discountAmountCent: number;
    paymentSuccessRate: number | null;
    registrationConversionRate: number | null;
  };
  hotConferences: Array<{
    id: string;
    title: string;
    orderCount: number;
    registrationCount: number;
  }>;
  hotSkus: Array<{
    id: string;
    name: string;
    conferenceTitle: string;
    stock: number;
    soldCount: number;
    remainingStock: number;
  }>;
  inventoryAlerts: Array<{
    id: string;
    name: string;
    conferenceTitle: string;
    remainingStock: number;
  }>;
  recentOrders: Array<{
    orderNo: string;
    attendeeName: string | null;
    payableAmountCent: number;
    paidAmountCent: number | null;
    status: string;
    createdAt: string;
    conferenceTitle: string;
  }>;
  recentRegistrations: Array<{
    registrationNo: string;
    attendeeName: string;
    phone: string;
    paidAmountCent: number;
    createdAt: string;
    conferenceTitle: string;
  }>;
}

export interface DashboardConversion {
  steps: Array<{
    key: string;
    label: string;
    count: number;
  }>;
}

export interface DashboardTrend {
  items: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
  }>;
}

export interface DashboardTicketSales {
  items: Array<{
    id: string;
    name: string;
    conferenceTitle: string;
    stock: number;
    soldCount: number;
    revenueCent: number;
    remainingStock: number;
  }>;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  group: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  system: boolean;
  enabled: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  displayName: string | null;
  enabled: boolean;
  roles: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialAsset {
  id: string;
  categoryId: string | null;
  name: string;
  usage: string;
  fileType: string;
  url: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  enabled: boolean;
  remark: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface CmsComponent {
  id: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export type CmsComponentSupportStatus = "supported" | "basic" | "unsupported" | "planned";

export interface ComponentPreset {
  id: string;
  type: string;
  name: string;
  group: string;
  description: string | null;
  schemaJson: Record<string, unknown>;
  defaultConfigJson: Record<string, unknown>;
  enabled: boolean;
  system: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersionSummary {
  id: string;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  title: string;
  componentCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageTemplate {
  id: string;
  pageKey: string;
  title: string;
  description: string | null;
  pageType: string;
  enabled: boolean;
  sortOrder: number;
  publishedVersionId: string | null;
  versions: PageVersionSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  templateId: string;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  title: string;
  components: CmsComponent[];
  themeJson: Record<string, unknown> | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template: {
    id: string;
    pageKey: string;
    title: string;
  };
}

export interface PageLibraryTemplate {
  id: string;
  pageKey: string;
  title: string;
  description: string | null;
  category: string;
  summary: string;
  system: boolean;
  version: {
    id: string;
    versionNo: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
    title: string;
    components: CmsComponent[];
    themeJson: Record<string, unknown> | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeConfig {
  visualPreset?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackground: string;
  radius: number;
  buttonStyle: string;
  shadow: string;
  titleFontSize: number;
  bannerStyle: string;
  adminBrandTitle?: string;
  adminBrandSubtitle?: string;
  adminBrandLogoUrl?: string;
  browserTitle?: string;
  browserIconUrl?: string;
  backgroundMode?: string;
  backgroundGradientFrom?: string;
  backgroundGradientTo?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  backgroundDynamicDensity?: number;
  backgroundDynamicSpeed?: number;
  backgroundBottomFilter?: boolean;
  backgroundApplyTo?: string;
  themeApplyMode?: string;
  themeApplyPageKeys?: string[];
  [key: string]: string | number | boolean | string[] | null | undefined;
}

export interface ActiveTheme {
  scope: string;
  themePresetId: string | null;
  config: ThemeConfig;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ThemePreset {
  id: string;
  code: string;
  name: string;
  description: string | null;
  configJson: ThemeConfig;
  system: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TabBarItem {
  id?: string;
  title: string;
  iconUrl: string | null;
  selectedIconUrl: string | null;
  pageKey: string;
  path: string;
  visible: boolean;
  sortOrder: number;
  requireLogin: boolean;
  badgeText: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TabBarConfig {
  enabled: boolean;
  items: TabBarItem[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminAppUser {
  id: string;
  openid: string | null;
  nickname: string | null;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
  phone: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  memberships?: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    level: { id: string; code: string; name: string };
  }>;
}

export interface MemberLevel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rank: number;
  priceCent: number;
  discountPercent: number | null;
  enabled: boolean;
  benefitsJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserMembership {
  id: string;
  userId: string;
  levelId: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  source: string | null;
  remark: string | null;
  user: AdminAppUser;
  level: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface FinanceOverview {
  cards: {
    totalRevenueCent: number;
    paidAmountCent: number;
    discountAmountCent: number;
    refundAmountCent: number;
    netRevenueCent: number;
    paidOrders: number;
    pendingOrders: number;
    registrationCount: number;
  };
  conferences: Array<{
    id: string;
    title: string;
    revenueCent: number;
    discountAmountCent: number;
    paidOrderCount: number;
    registrationCount: number;
  }>;
}

export interface FinancePayment {
  id: string;
  provider: string;
  status: string;
  outTradeNo: string;
  transactionId: string | null;
  amountCent: number;
  paidAt: string | null;
  createdAt: string;
  orderNo: string;
  orderStatus: string;
  conferenceTitle: string;
}

export interface FinanceBatch {
  id: string;
  batchNo: string;
  status: string;
  source: string;
  differenceCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSku {
  id: string;
  productId: string;
  name: string;
  priceCent: number;
  stock: number;
  lockedStock: number;
  soldCount: number;
  availableStock: number;
  status: string;
  specsJson: Record<string, unknown> | null;
  productTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  categoryId: string | null;
  title: string;
  subtitle: string | null;
  descriptionJson: Record<string, unknown> | null;
  coverImageUrl: string | null;
  status: string;
  sortOrder: number;
  category: ProductCategory | null;
  skus: ProductSku[];
  images: ProductImage[];
  detailImageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MallOrderItem {
  id: string;
  orderId: string;
  skuId: string;
  productTitle: string;
  skuName: string;
  unitPriceCent: number;
  quantity: number;
  totalAmountCent: number;
  createdAt: string;
}

export interface MallShipment {
  id: string;
  orderId: string;
  orderNo?: string;
  receiverName?: string | null;
  receiverPhone?: string | null;
  company: string | null;
  trackingNo: string | null;
  pickupCode: string | null;
  remark: string | null;
  status: string;
  shippedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MallAfterSale {
  id: string;
  orderId: string;
  orderNo?: string;
  receiverName?: string | null;
  receiverPhone?: string | null;
  type: string;
  status: string;
  reason: string | null;
  note: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  refundNotice?: string | null;
}

export interface MallOrder {
  id: string;
  orderNo: string;
  userId: string | null;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  remark: string | null;
  paidAt: string | null;
  user?: AdminWechatUser | null;
  items: MallOrderItem[];
  shipments: MallShipment[];
  afterSales: MallAfterSale[];
  paymentEnabled?: boolean;
  paymentNotice?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MallInventoryLog {
  id: string;
  skuId: string;
  orderId: string | null;
  action: string;
  quantity: number;
  beforeLockedStock: number;
  afterLockedStock: number;
  beforeSoldCount: number;
  afterSoldCount: number;
  remark: string | null;
  skuName: string;
  productTitle: string;
  orderNo: string | null;
  createdAt: string;
}
