import { API_BASE_URL } from "../config";
import { apiRequest, getAdminToken, setAdminToken, toQuery } from "./api";
import type {
  AdminOrder,
  AdminOrderDetail,
  AdminRegistration,
  AdminRegistrationDetail,
  AdminRegistrationAuditLog,
  AdminRegistrationFullDetail,
  AdminAccount,
  AdminAuditLog,
  AdminUser,
  ApiList,
  ActiveTheme,
  AdminAppUser,
  Conference,
  ComponentPreset,
  CouponCampaign,
  CouponCampaignQr,
  Coupon,
  PageTemplate,
  PageLibraryTemplate,
  PageVersion,
  DashboardOverview,
  DashboardConversion,
  DashboardTicketSales,
  DashboardTrend,
  FinanceBatch,
  FinanceInvoice,
  FinanceOverview,
  FinancePayment,
  FinanceRefund,
  FormField,
  MaterialAsset,
  MaterialCategory,
  MallAfterSale,
  MallInventoryLog,
  MallOrder,
  MallShipment,
  MemberBenefit,
  MemberBenefitGrant,
  MemberLevel,
  MembershipPriceRule,
  NotificationLog,
  NotificationChannelConfig,
  NotificationTask,
  NotificationTemplate,
  Permission,
  Product,
  ProductCategory,
  ProductSku,
  PromotionRule,
  Role,
  ReconciliationResult,
  Sku,
  TabBarConfig,
  ThemePreset,
  WechatBill,
  UserMembership
} from "./types";

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  const data = await apiRequest<{ token: string; admin: AdminUser }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setAdminToken(data.token);
  return data.admin;
}

export function getAdminMe(): Promise<{ admin: AdminUser }> {
  return apiRequest<{ admin: AdminUser }>("/admin/auth/me");
}

export function getDashboardOverview(params: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
  return apiRequest<DashboardOverview>(`/admin/dashboard/overview${toQuery(params)}`);
}

export function getDashboardConversion(params: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
  return apiRequest<DashboardConversion>(`/admin/dashboard/conversion${toQuery(params)}`);
}

export function getDashboardPaymentTrend(params: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
  return apiRequest<DashboardTrend>(`/admin/dashboard/payment-trend${toQuery(params)}`);
}

export function getDashboardOrderAbnormalTrend(params: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
  return apiRequest<DashboardTrend>(`/admin/dashboard/order-abnormal-trend${toQuery(params)}`);
}

export function getDashboardTicketSales(params: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
  return apiRequest<DashboardTicketSales>(`/admin/dashboard/ticket-sales${toQuery(params)}`);
}

export function listConferences(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<Conference>>(`/admin/conferences${toQuery(params)}`);
}

export function createConference(input: Record<string, unknown>) {
  return apiRequest<Conference>("/admin/conferences", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateConference(id: string, input: Record<string, unknown>) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function updateConferenceStatus(id: string, status: string) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function getConferenceCheckInConfig(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(id)}/checkin-config`);
}

export function updateConferenceCheckInConfig(id: string, input: boolean | Record<string, unknown>) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}/check-in-config`, {
    method: "PATCH",
    body: JSON.stringify(typeof input === "boolean" ? { checkInEnabled: input } : input)
  });
}

export function listSkus(conferenceId: string) {
  return apiRequest<{ items: Sku[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/skus`);
}

export function createSku(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<Sku>(`/admin/conferences/${encodeURIComponent(conferenceId)}/skus`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateSku(id: string, input: Record<string, unknown>) {
  return apiRequest<Sku>(`/admin/skus/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listFormFields(conferenceId: string) {
  return apiRequest<{ formId: string; items: FormField[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/form-fields`);
}

export function createFormField(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<FormField>(`/admin/conferences/${encodeURIComponent(conferenceId)}/form-fields`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateFormField(id: string, input: Record<string, unknown>) {
  return apiRequest<FormField>(`/admin/form-fields/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function disableFormField(id: string) {
  return apiRequest<FormField>(`/admin/form-fields/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function listOrders(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string; status?: string; paymentStatus?: string }) {
  return apiRequest<ApiList<AdminOrder>>(`/admin/orders${toQuery(params)}`);
}

export function exportOrdersExcel(params: {
  keyword?: string;
  conferenceId?: string;
  status?: string;
  paymentStatus?: string;
  onlyExceptions?: boolean;
}) {
  return downloadAdminFile(`/admin/exports/orders.xls${toQuery(params)}`, "orders.xls");
}

export function getOrder(orderNo: string) {
  return apiRequest<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNo)}`);
}

export function closeOrder(orderNo: string) {
  return apiRequest<{ orderNo: string; closed: number; skipped: number; failed: number }>(`/admin/orders/${encodeURIComponent(orderNo)}/close`, {
    method: "PATCH"
  });
}

export function closeOrdersByFilter(params: { keyword?: string; conferenceId?: string; status?: string; paymentStatus?: string; onlyExceptions?: boolean }) {
  return apiRequest<{ matched: number; closed: number; skipped: number; failed: number }>("/admin/orders/close-by-filter", {
    method: "POST",
    body: JSON.stringify(params)
  });
}

export function reviewPaymentException(orderNo: string, note: string) {
  return apiRequest(`/admin/payment-exceptions/${encodeURIComponent(orderNo)}/review`, {
    method: "POST",
    body: JSON.stringify({ note })
  });
}

export function listRegistrations(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string; status?: string }) {
  return apiRequest<ApiList<AdminRegistration>>(`/admin/registrations${toQuery(params)}`);
}

export function exportRegistrationsExcel(params: {
  keyword?: string;
  conferenceId?: string;
  status?: string;
  paymentStatus?: string;
  checkInStatus?: string;
}) {
  return downloadAdminFile(`/admin/exports/registrations.xls${toQuery(params)}`, "registrations.xls");
}

export function getRegistration(id: string) {
  return apiRequest<AdminRegistrationDetail>(`/admin/registrations/${encodeURIComponent(id)}`);
}

export function getRegistrationDetail(id: string) {
  return apiRequest<AdminRegistrationFullDetail>(`/admin/registrations/${encodeURIComponent(id)}/detail`);
}

export function getRegistrationAuditLogs(id: string) {
  return apiRequest<{ items: AdminRegistrationAuditLog[] }>(`/admin/registrations/${encodeURIComponent(id)}/audit-logs`);
}

export function updateRegistrationRemark(id: string, adminRemark: string | null) {
  return apiRequest<AdminRegistrationDetail>(`/admin/registrations/${encodeURIComponent(id)}/remark`, {
    method: "PATCH",
    body: JSON.stringify({ adminRemark })
  });
}

export function updateRegistrationFormValues(id: string, formDataJson: Record<string, unknown>) {
  return apiRequest<AdminRegistrationDetail>(`/admin/registrations/${encodeURIComponent(id)}/form-values`, {
    method: "PATCH",
    body: JSON.stringify({ formDataJson })
  });
}

export function checkInRegistrationAttendee(id: string) {
  return apiRequest(`/admin/registration-attendees/${encodeURIComponent(id)}/check-in`, {
    method: "POST"
  });
}

export function listCoupons(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string }) {
  return apiRequest<ApiList<Coupon>>(`/admin/coupons${toQuery(params)}`);
}

export function createCoupon(input: Record<string, unknown>) {
  return apiRequest<Coupon>("/admin/coupons", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCoupon(id: string, input: Record<string, unknown>) {
  return apiRequest<Coupon>(`/admin/coupons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listPromotionRules(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string }) {
  return apiRequest<ApiList<PromotionRule>>(`/admin/promotion-rules${toQuery(params)}`);
}

export function createPromotionRule(input: Record<string, unknown>) {
  return apiRequest<PromotionRule>("/admin/promotion-rules", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updatePromotionRule(id: string, input: Record<string, unknown>) {
  return apiRequest<PromotionRule>(`/admin/promotion-rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listCouponCampaigns(params: { page?: number; pageSize?: number; keyword?: string }) {
  return apiRequest<ApiList<CouponCampaign>>(`/admin/coupon-campaigns${toQuery(params)}`);
}

export function createCouponCampaign(input: Record<string, unknown>) {
  return apiRequest<CouponCampaign>("/admin/coupon-campaigns", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCouponCampaign(id: string, input: Record<string, unknown>) {
  return apiRequest<CouponCampaign>(`/admin/coupon-campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function generateCouponCampaignQr(id: string) {
  return apiRequest<CouponCampaignQr>(`/admin/coupon-campaigns/${encodeURIComponent(id)}/generate-qr`, {
    method: "POST"
  });
}

export function listNotificationTemplates(params: { page?: number; pageSize?: number; keyword?: string; channel?: string; status?: string }) {
  return apiRequest<ApiList<NotificationTemplate>>(`/admin/notification-templates${toQuery(params)}`);
}

export function createNotificationTemplate(input: Record<string, unknown>) {
  return apiRequest<NotificationTemplate>("/admin/notification-templates", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateNotificationTemplate(id: string, input: Record<string, unknown>) {
  return apiRequest<NotificationTemplate>(`/admin/notification-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function previewNotificationTemplate(id: string, input: Record<string, unknown>) {
  return apiRequest<{ templateId: string; code: string; channel: string; title: string; content: unknown; variables: Record<string, unknown> }>(
    `/admin/notification-templates/${encodeURIComponent(id)}/preview`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function testSendNotificationTemplate(id: string, input: Record<string, unknown>) {
  return apiRequest<{
    task: NotificationTask;
    result: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }>(`/admin/notification-templates/${encodeURIComponent(id)}/test-send`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listNotificationTasks(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<NotificationTask>>(`/admin/notification-tasks${toQuery(params)}`);
}

export function createNotificationTask(input: Record<string, unknown>) {
  return apiRequest<NotificationTask>("/admin/notification-tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendNotificationTaskNow(id: string) {
  return apiRequest<{
    task: NotificationTask;
    result: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }>(`/admin/notification-tasks/${encodeURIComponent(id)}/send-now`, {
    method: "POST"
  });
}

export function retryNotificationTask(id: string) {
  return apiRequest<{
    task: NotificationTask;
    result: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }>(`/admin/notification-tasks/${encodeURIComponent(id)}/retry`, {
    method: "POST"
  });
}

export function listNotificationLogs(params: { page?: number; pageSize?: number; taskId?: string; status?: string }) {
  return apiRequest<ApiList<NotificationLog>>(`/admin/notification-logs${toQuery(params)}`);
}

export function getWechatSubscribeConfig() {
  return apiRequest<NotificationChannelConfig>("/admin/wechat-subscribe-config");
}

export function updateWechatSubscribeConfig(input: Record<string, unknown>) {
  return apiRequest<NotificationChannelConfig>("/admin/wechat-subscribe-config", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getSmsConfig() {
  return apiRequest<NotificationChannelConfig>("/admin/sms-config");
}

export function updateSmsConfig(input: Record<string, unknown>) {
  return apiRequest<NotificationChannelConfig>("/admin/sms-config", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listAccounts() {
  return apiRequest<{ items: AdminAccount[] }>("/admin/accounts");
}

export function createAccount(input: Record<string, unknown>) {
  return apiRequest<AdminAccount>("/admin/accounts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAccount(id: string, input: Record<string, unknown>) {
  return apiRequest<AdminAccount>(`/admin/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listPermissions() {
  return apiRequest<{ items: Permission[] }>("/admin/permissions");
}

export function listRoles() {
  return apiRequest<{ items: Role[] }>("/admin/roles");
}

export function listAuditLogs(params: { page?: number; pageSize?: number; keyword?: string; action?: string; entityType?: string }) {
  return apiRequest<ApiList<AdminAuditLog>>(`/admin/audit-logs${toQuery(params)}`);
}

export function createRole(input: Record<string, unknown>) {
  return apiRequest<Role>("/admin/roles", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateRole(id: string, input: Record<string, unknown>) {
  return apiRequest<Role>(`/admin/roles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listMaterialCategories() {
  return apiRequest<{ items: MaterialCategory[] }>("/admin/material-categories");
}

export function createMaterialCategory(input: Record<string, unknown>) {
  return apiRequest<MaterialCategory>("/admin/material-categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listMaterials(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: string;
  usage?: string;
  enabled?: boolean;
}) {
  return apiRequest<ApiList<MaterialAsset>>(`/admin/materials${toQuery(params)}`);
}

export function createMaterial(input: {
  name: string;
  usage: string;
  categoryId?: string;
  fileType?: string;
  url?: string;
  remark?: string;
  file?: File;
  onProgress?: (percent: number) => void;
}) {
  if (input.file) {
    const formData = new FormData();
    formData.set("file", input.file);
    formData.set("name", input.name);
    formData.set("usage", input.usage);
    if (input.categoryId) formData.set("categoryId", input.categoryId);
    if (input.remark) formData.set("remark", input.remark);
    return uploadMaterialWithProgress(formData, input.onProgress);
  }

  return apiRequest<MaterialAsset>("/admin/materials", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

function uploadMaterialWithProgress(formData: FormData, onProgress?: (percent: number) => void): Promise<MaterialAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/admin/materials`);
    const token = getAdminToken();
    if (token) {
      xhr.setRequestHeader("authorization", `Bearer ${token}`);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      const body = parseApiBody<MaterialAsset>(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && body.code === "OK" && body.data) {
        onProgress?.(100);
        resolve(body.data);
        return;
      }
      reject(new Error(body.message || `上传失败 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("网络异常，素材上传失败"));
    xhr.send(formData);
  });
}

function parseApiBody<T>(text: string): { code?: string; message?: string; data?: T } {
  try {
    return JSON.parse(text) as { code?: string; message?: string; data?: T };
  } catch {
    return {};
  }
}

async function downloadAdminFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as { message?: string }));
    throw new Error(body.message || `下载失败 (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function updateMaterial(id: string, input: Record<string, unknown>) {
  return apiRequest<MaterialAsset>(`/admin/materials/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function disableMaterial(id: string) {
  return apiRequest<MaterialAsset>(`/admin/materials/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function listPages() {
  return apiRequest<{ items: PageTemplate[] }>("/admin/pages");
}

export function createPage(input: Record<string, unknown>) {
  return apiRequest<PageTemplate>("/admin/pages", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listPageLibraryTemplates() {
  return apiRequest<{ items: PageLibraryTemplate[] }>("/admin/page-library-templates");
}

export function createPageLibraryTemplate(input: Record<string, unknown>) {
  return apiRequest<PageLibraryTemplate>("/admin/page-library-templates", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updatePage(id: string, input: Record<string, unknown>) {
  return apiRequest<PageTemplate>(`/admin/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function rollbackPage(id: string, input: Record<string, unknown> = {}) {
  return apiRequest<PageVersion>(`/admin/pages/${encodeURIComponent(id)}/rollback`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getPageVersion(id: string) {
  return apiRequest<PageVersion>(`/admin/page-versions/${encodeURIComponent(id)}`);
}

export function updatePageVersion(id: string, input: Record<string, unknown>) {
  return apiRequest<PageVersion>(`/admin/page-versions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function publishPageVersion(id: string, input: { confirmBasic?: boolean } = {}) {
  return apiRequest<PageVersion>(`/admin/page-versions/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listComponentPresets() {
  return apiRequest<{ items: ComponentPreset[] }>("/admin/component-presets");
}

export function getTheme() {
  return apiRequest<ActiveTheme>("/admin/theme");
}

export function updateTheme(input: Record<string, unknown>) {
  return apiRequest<ActiveTheme>("/admin/theme", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listThemePresets() {
  return apiRequest<{ items: ThemePreset[] }>("/admin/theme-presets");
}

export function createThemePreset(input: Record<string, unknown>) {
  return apiRequest<ThemePreset>("/admin/theme-presets", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateThemePreset(id: string, input: Record<string, unknown>) {
  return apiRequest<ThemePreset>(`/admin/theme-presets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getTabbar() {
  return apiRequest<TabBarConfig>("/admin/tabbar");
}

export function updateTabbar(input: Record<string, unknown>) {
  return apiRequest<TabBarConfig>("/admin/tabbar", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listUsers(params: { page?: number; pageSize?: number; keyword?: string }) {
  return apiRequest<ApiList<AdminAppUser>>(`/admin/users${toQuery(params)}`);
}

export function listMemberLevels() {
  return apiRequest<{ items: MemberLevel[] }>("/admin/member-levels");
}

export function listMemberLevelOptions() {
  return apiRequest<{ items: Array<Pick<MemberLevel, "id" | "code" | "name" | "enabled" | "defaultDays" | "pricingEnabled">> }>("/admin/member-levels/options");
}

export function createMemberLevel(input: Record<string, unknown>) {
  return apiRequest<MemberLevel>("/admin/member-levels", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMemberLevel(id: string, input: Record<string, unknown>) {
  return apiRequest<MemberLevel>(`/admin/member-levels/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listMemberships(params: { page?: number; pageSize?: number; keyword?: string; status?: string; levelId?: string; expiresBefore?: string; expiresAfter?: string }) {
  return apiRequest<ApiList<UserMembership>>(`/admin/memberships${toQuery(params)}`);
}

export function grantMembership(input: Record<string, unknown>) {
  return apiRequest<UserMembership>("/admin/memberships/grant", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export const assignMembership = grantMembership;

export function renewMembership(id: string, input: Record<string, unknown>) {
  return apiRequest<UserMembership>(`/admin/memberships/${encodeURIComponent(id)}/renew`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function disableMembership(id: string, input: Record<string, unknown>) {
  return apiRequest<UserMembership>(`/admin/memberships/${encodeURIComponent(id)}/disable`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function changeMembershipLevel(id: string, input: Record<string, unknown>) {
  return apiRequest<UserMembership>(`/admin/memberships/${encodeURIComponent(id)}/level`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listMemberBenefits(params: { levelId?: string } = {}) {
  return apiRequest<{ items: MemberBenefit[] }>(`/admin/member-benefits${toQuery(params)}`);
}

export function createMemberBenefit(input: Record<string, unknown>) {
  return apiRequest<MemberBenefit>("/admin/member-benefits", { method: "POST", body: JSON.stringify(input) });
}

export function updateMemberBenefit(id: string, input: Record<string, unknown>) {
  return apiRequest<MemberBenefit>(`/admin/member-benefits/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listMemberBenefitOptions(params: { levelId?: string } = {}) {
  return apiRequest<{ items: MemberBenefit[] }>(`/admin/member-benefits/options${toQuery(params)}`);
}

export function listMemberBenefitGrants(params: { page?: number; pageSize?: number; userId?: string; membershipId?: string; benefitId?: string; status?: string } = {}) {
  return apiRequest<ApiList<MemberBenefitGrant>>(`/admin/member-benefit-grants${toQuery(params)}`);
}

export function revokeMemberBenefitGrant(id: string, remark?: string) {
  return apiRequest<MemberBenefitGrant>(`/admin/member-benefit-grants/${encodeURIComponent(id)}/revoke`, { method: "POST", body: JSON.stringify({ remark }) });
}

export function listMemberPricingRules(params: { levelId?: string; conferenceId?: string } = {}) {
  return apiRequest<{ items: MembershipPriceRule[] }>(`/admin/member-pricing-rules${toQuery(params)}`);
}

export function createMemberPricingRule(input: Record<string, unknown>) {
  return apiRequest<MembershipPriceRule>("/admin/member-pricing-rules", { method: "POST", body: JSON.stringify(input) });
}

export function updateMemberPricingRule(id: string, input: Record<string, unknown>) {
  return apiRequest<MembershipPriceRule>(`/admin/member-pricing-rules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteMemberPricingRule(id: string) {
  return apiRequest<MembershipPriceRule>(`/admin/member-pricing-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getFinanceOverview() {
  return apiRequest<FinanceOverview>("/admin/finance/overview");
}

export function listFinancePayments(params: { page?: number; pageSize?: number; keyword?: string; status?: string; provider?: string; sourceType?: string; startAt?: string; endAt?: string }) {
  return apiRequest<ApiList<FinancePayment>>(`/admin/finance/payments${toQuery(params)}`);
}

export function listPaymentExceptions(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string } = {}) {
  return apiRequest<{ items: Record<string, unknown>[]; total: number }>(`/admin/payment-exceptions${toQuery(params)}`);
}

export function listFinanceBatches(params: { page?: number; pageSize?: number } = {}) {
  return apiRequest<ApiList<FinanceBatch>>(`/admin/finance/reconciliation-batches${toQuery(params)}`);
}

export function createFinanceBatch(input: Record<string, unknown> = {}) {
  return apiRequest<FinanceBatch>("/admin/finance/reconciliation-batches", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listProductCategories(params: { page?: number; pageSize?: number; keyword?: string; enabled?: boolean } = {}) {
  return apiRequest<ApiList<ProductCategory>>(`/admin/mall/categories${toQuery(params)}`);
}

export function getProductCategoryOptions(params: { keyword?: string } = {}) {
  return apiRequest<{ items: ProductCategory[] }>(`/admin/mall/categories/options${toQuery(params)}`);
}

export function createProductCategory(input: Record<string, unknown>) {
  return apiRequest<ProductCategory>("/admin/mall/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateProductCategory(id: string, input: Record<string, unknown>) {
  return apiRequest<ProductCategory>(`/admin/mall/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listProducts(params: { page?: number; pageSize?: number; keyword?: string; status?: string; categoryId?: string }) {
  return apiRequest<ApiList<Product>>(`/admin/mall/products${toQuery(params)}`);
}

export function getProductOptions(params: { keyword?: string } = {}) {
  return apiRequest<{ items: Product[] }>(`/admin/mall/products/options${toQuery(params)}`);
}

export function getProductDetail(id: string) {
  return apiRequest<Product>(`/admin/mall/products/${encodeURIComponent(id)}`);
}

export function createProduct(input: Record<string, unknown>) {
  return apiRequest<Product>("/admin/mall/products", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateProduct(id: string, input: Record<string, unknown>) {
  return apiRequest<Product>(`/admin/mall/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function createProductSku(productId: string, input: Record<string, unknown>) {
  return apiRequest<ProductSku>(`/admin/mall/products/${encodeURIComponent(productId)}/skus`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createProductSkuFromBody(input: Record<string, unknown>) {
  return apiRequest<ProductSku>("/admin/mall/skus", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateProductSku(id: string, input: Record<string, unknown>) {
  return apiRequest<ProductSku>(`/admin/mall/skus/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listProductSkus(params: { page?: number; pageSize?: number; productId?: string; status?: string; keyword?: string } = {}) {
  return apiRequest<ApiList<ProductSku>>(`/admin/mall/skus${toQuery(params)}`);
}

export function listMallInventoryLogs(params: { page?: number; pageSize?: number; skuId?: string } = {}) {
  return apiRequest<ApiList<MallInventoryLog>>(`/admin/mall/inventory-logs${toQuery(params)}`);
}

export function listMallOrders(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<MallOrder>>(`/admin/mall/orders${toQuery(params)}`);
}

export function getMallOrderOptions(params: { keyword?: string } = {}) {
  return apiRequest<{ items: MallOrder[] }>(`/admin/mall/orders/options${toQuery(params)}`);
}

export function getMallOrder(id: string) {
  return apiRequest<MallOrder>(`/admin/mall/orders/${encodeURIComponent(id)}`);
}

export function closeMallOrder(id: string) {
  return apiRequest<MallOrder>(`/admin/mall/orders/${encodeURIComponent(id)}/close`, {
    method: "PATCH"
  });
}

export function shipMallOrder(id: string, input: Record<string, unknown>) {
  return apiRequest<MallShipment>(`/admin/mall/orders/${encodeURIComponent(id)}/ship`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function verifyMallOrder(id: string) {
  return apiRequest<MallOrder>(`/admin/mall/orders/${encodeURIComponent(id)}/verify`, { method: "POST" });
}

export function listMallShipments(params: { page?: number; pageSize?: number; status?: string; orderId?: string } = {}) {
  return apiRequest<ApiList<MallShipment>>(`/admin/mall/shipments${toQuery(params)}`);
}

export function createMallShipment(input: Record<string, unknown>) {
  return apiRequest<MallShipment>("/admin/mall/shipments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMallShipment(id: string, input: Record<string, unknown>) {
  return apiRequest<MallShipment>(`/admin/mall/shipments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listMallAfterSales(params: { page?: number; pageSize?: number; status?: string; orderId?: string } = {}) {
  return apiRequest<ApiList<MallAfterSale>>(`/admin/mall/aftersales${toQuery(params)}`);
}

export function createMallAfterSale(input: Record<string, unknown>) {
  return apiRequest<MallAfterSale>("/admin/mall/aftersales", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMallAfterSale(id: string, input: Record<string, unknown>) {
  return apiRequest<MallAfterSale>(`/admin/mall/aftersales/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function processMallAfterSaleRefund(id: string) {
  return apiRequest<MallAfterSale>(`/admin/mall/aftersales/${encodeURIComponent(id)}/process-refund`, {
    method: "POST"
  });
}

export function getInventoryAlertRule(conferenceId: string) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/inventory-alert-rule`);
}

export function updateInventoryAlertRule(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/inventory-alert-rule`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function scanInventoryAlerts() {
  return apiRequest<Record<string, unknown>>("/admin/inventory-alerts/scan", { method: "POST" });
}

export function listInventoryAlertLogs(params: { page?: number; pageSize?: number; conferenceId?: string; status?: string }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/inventory-alert-logs${toQuery(params)}`);
}

export function listCustomerGroups(params: { page?: number; pageSize?: number; keyword?: string }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/customer-groups${toQuery(params)}`);
}

export function createCustomerGroup(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/customer-groups", { method: "POST", body: JSON.stringify(input) });
}

export function syncCustomerGroupsFromWecom() {
  return apiRequest<Record<string, unknown>>("/admin/customer-groups/sync-wecom", { method: "POST" });
}

export function listCustomerGroupMessageTasks(params: { page?: number; pageSize?: number }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/customer-group-message-tasks${toQuery(params)}`);
}

export function createCustomerGroupMessageTask(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/customer-group-message-tasks", { method: "POST", body: JSON.stringify(input) });
}

export function createWecomCustomerGroupTask(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/customer-group-message-tasks/${encodeURIComponent(id)}/create-wecom-task`, { method: "POST" });
}

export function getWecomConfig() {
  return apiRequest<Record<string, unknown>>("/admin/wecom/config");
}

export function updateWecomConfig(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/wecom/config", { method: "PATCH", body: JSON.stringify(input) });
}

export function testWecomAccessToken() {
  return apiRequest<Record<string, unknown>>("/admin/wecom/config/test-token", { method: "POST" });
}

export function checkWecomPermissions() {
  return apiRequest<Record<string, unknown>>("/admin/wecom/config/check-permissions", { method: "POST" });
}

export function listWecomCustomerGroups(params: { page?: number; pageSize?: number; keyword?: string }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/wecom/customer-groups${toQuery(params)}`);
}

export function syncWecomCustomerGroups() {
  return apiRequest<Record<string, unknown>>("/admin/wecom/customer-groups/sync", { method: "POST" });
}

export function bindWecomCustomerGroupConference(id: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/wecom/customer-groups/${encodeURIComponent(id)}/bind-conference`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listWecomWelcomeTemplates() {
  return apiRequest<{ items: Record<string, unknown>[]; syncNotice?: string }>("/admin/wecom/welcome-templates");
}

export function createWecomWelcomeTemplate(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/wecom/welcome-templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateWecomWelcomeTemplate(id: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/wecom/welcome-templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteWecomWelcomeTemplate(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/wecom/welcome-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listWecomGroupMessageTasks(params: { page?: number; pageSize?: number }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/wecom/group-message-tasks${toQuery(params)}`);
}

export function createWecomGroupMessageTask(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/wecom/group-message-tasks", { method: "POST", body: JSON.stringify(input) });
}

export function createOfficialWecomGroupMessageTask(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/wecom/group-message-tasks/${encodeURIComponent(id)}/create-wecom-task`, { method: "POST" });
}

export function refreshWecomGroupMessageTaskResult(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/wecom/group-message-tasks/${encodeURIComponent(id)}/refresh-result`, { method: "POST" });
}

export function listWecomGroupMessageLogs(params: { page?: number; pageSize?: number }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/wecom/group-message-logs${toQuery(params)}`);
}

export function listWecomCallbackEvents(params: { page?: number; pageSize?: number }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/wecom/callback-events${toQuery(params)}`);
}

export function getKnowledgeBase(conferenceId: string) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/knowledge-base`);
}

export function updateConferenceKnowledgeBase(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/knowledge-base`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listKnowledgeBases(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string } = {}) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/knowledge-bases${toQuery(params)}`);
}

export function createKnowledgeBase(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/knowledge-bases", { method: "POST", body: JSON.stringify(input) });
}

export function updateKnowledgeBase(id: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/knowledge-bases/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listKnowledgeDocuments(conferenceId: string, params: { page?: number; pageSize?: number; keyword?: string; status?: string } = {}) {
  return apiRequest<ApiList<Record<string, unknown>> & { knowledgeBase?: Record<string, unknown> }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/knowledge-documents${toQuery(params)}`);
}

export function createKnowledgeDocument(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/knowledge-documents`, { method: "POST", body: JSON.stringify(input) });
}

export function updateKnowledgeDocument(id: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/knowledge-documents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function rebuildKnowledgeDocument(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/knowledge-documents/${encodeURIComponent(id)}/rebuild`, { method: "POST" });
}

export function deleteKnowledgeDocument(id: string) {
  return apiRequest<Record<string, unknown>>(`/admin/knowledge-documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listAiSuggestions(conferenceId: string) {
  return apiRequest<{ items: Record<string, unknown>[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/ai-suggestions`);
}

export function createAiSuggestions(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<{ items: Record<string, unknown>[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/ai-suggestions`, { method: "POST", body: JSON.stringify(input) });
}

export function updateAiSuggestion(id: string, input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/ai-suggestions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listAiQuestionLogs(conferenceId: string, params: { page?: number; pageSize?: number; keyword?: string; fallback?: string } = {}) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/conferences/${encodeURIComponent(conferenceId)}/ai-question-logs${toQuery(params)}`);
}

export function getAiConfig() {
  return apiRequest<Record<string, unknown>>("/admin/ai-config");
}

export function updateAiConfig(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/ai-config", { method: "PATCH", body: JSON.stringify(input) });
}

export function verifyCheckin(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/checkin/scan", { method: "POST", body: JSON.stringify({ qrPayload: input.credentialCode ?? input.qrPayload, remark: input.remark }) });
}

export function manualCheckin(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/checkins/manual", { method: "POST", body: JSON.stringify(input) });
}

export function listCheckinLogs(params: { page?: number; pageSize?: number; conferenceId?: string }) {
  return apiRequest<ApiList<Record<string, unknown>>>(`/admin/checkins/records${toQuery(params)}`);
}

export function getCheckinStats(params: { conferenceId?: string } = {}) {
  return apiRequest<Record<string, unknown>>(`/admin/checkins/statistics${toQuery(params)}`);
}

export function listRefunds(params: { page?: number; pageSize?: number; keyword?: string; status?: string; sourceType?: string }) {
  return apiRequest<ApiList<FinanceRefund>>(`/admin/finance/refunds${toQuery(params)}`);
}

export function createRefund(input: Record<string, unknown>) {
  return apiRequest<FinanceRefund>("/admin/finance/refunds", { method: "POST", body: JSON.stringify(input) });
}

export function approveRefund(id: string) {
  return apiRequest<FinanceRefund>(`/admin/finance/refunds/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export function rejectRefund(id: string, reason: string) {
  return apiRequest<FinanceRefund>(`/admin/finance/refunds/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function listInvoices(params: { page?: number; pageSize?: number; keyword?: string; status?: string; sourceType?: string }) {
  return apiRequest<ApiList<FinanceInvoice>>(`/admin/finance/invoices${toQuery(params)}`);
}

export function approveInvoice(id: string) {
  return apiRequest<FinanceInvoice>(`/admin/finance/invoices/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export function rejectInvoice(id: string, reason: string) {
  return apiRequest<FinanceInvoice>(`/admin/finance/invoices/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function markInvoiceIssued(id: string, input: Record<string, unknown> = {}) {
  return apiRequest<FinanceInvoice>(`/admin/finance/invoices/${encodeURIComponent(id)}/mark-issued`, { method: "POST", body: JSON.stringify(input) });
}

export function createWechatBill(input: Record<string, unknown>) {
  return apiRequest<WechatBill>("/admin/finance/wechat-bills", { method: "POST", body: JSON.stringify(input) });
}

export function listWechatBills(params: { page?: number; pageSize?: number; status?: string } = {}) {
  return apiRequest<ApiList<WechatBill>>(`/admin/finance/wechat-bills${toQuery(params)}`);
}

export function importWechatBill(input: Record<string, unknown>) {
  return apiRequest<WechatBill>("/admin/finance/wechat-bills/import", { method: "POST", body: JSON.stringify(input) });
}

export function downloadWechatBill(id: string) {
  return apiRequest<WechatBill>(`/admin/finance/wechat-bills/${encodeURIComponent(id)}/download`, { method: "POST" });
}

export function reconcileWechatBill(id: string, input: Record<string, unknown> = {}) {
  return apiRequest<WechatBill>(`/admin/finance/wechat-bills/${encodeURIComponent(id)}/reconcile`, { method: "POST", body: JSON.stringify(input) });
}

export function listReconciliationResults(params: { page?: number; pageSize?: number; keyword?: string; status?: string; type?: string }) {
  return apiRequest<ApiList<ReconciliationResult>>(`/admin/finance/reconciliation-results${toQuery(params)}`);
}

export function markReconciliationReviewed(id: string, remark: string) {
  return apiRequest<ReconciliationResult>(`/admin/finance/reconciliation-results/${encodeURIComponent(id)}/mark-reviewed`, { method: "POST", body: JSON.stringify({ remark }) });
}

export function getNotificationChannelConfig(channel: "wechat-subscribe" | "sms") {
  return apiRequest<Record<string, unknown>>(`/admin/${channel === "sms" ? "sms-config" : "wechat-subscribe-config"}`);
}

export function updateNotificationChannelConfig(channel: "wechat-subscribe" | "sms", input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/${channel === "sms" ? "sms-config" : "wechat-subscribe-config"}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
