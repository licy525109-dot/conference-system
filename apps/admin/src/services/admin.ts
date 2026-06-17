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
  Coupon,
  PageTemplate,
  PageLibraryTemplate,
  PageVersion,
  DashboardOverview,
  DashboardConversion,
  DashboardTicketSales,
  DashboardTrend,
  FinanceBatch,
  FinanceOverview,
  FinancePayment,
  FormField,
  MaterialAsset,
  MaterialCategory,
  MallOrder,
  MemberLevel,
  NotificationLog,
  NotificationTask,
  NotificationTemplate,
  Permission,
  Product,
  ProductCategory,
  ProductSku,
  PromotionRule,
  Role,
  Sku,
  TabBarConfig,
  ThemePreset,
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

export function updateConferenceCheckInConfig(id: string, checkInEnabled: boolean) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}/check-in-config`, {
    method: "PATCH",
    body: JSON.stringify({ checkInEnabled })
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

export function deleteOrder(orderNo: string) {
  return apiRequest<{ orderNo: string; deleted: number; skipped: number }>(`/admin/orders/${encodeURIComponent(orderNo)}`, {
    method: "DELETE"
  });
}

export function deleteOrdersByFilter(params: { keyword?: string; conferenceId?: string; status?: string; paymentStatus?: string; onlyExceptions?: boolean }) {
  return apiRequest<{ matched: number; deleted: number; skipped: number }>("/admin/orders/delete-by-filter", {
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

export function listNotificationLogs(params: { page?: number; pageSize?: number; taskId?: string; status?: string }) {
  return apiRequest<ApiList<NotificationLog>>(`/admin/notification-logs${toQuery(params)}`);
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

export function publishPageVersion(id: string) {
  return apiRequest<PageVersion>(`/admin/page-versions/${encodeURIComponent(id)}/publish`, {
    method: "POST"
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

export function listMemberships(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<UserMembership>>(`/admin/memberships${toQuery(params)}`);
}

export function assignMembership(input: Record<string, unknown>) {
  return apiRequest<UserMembership>("/admin/memberships", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getFinanceOverview() {
  return apiRequest<FinanceOverview>("/admin/finance/overview");
}

export function listFinancePayments(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<FinancePayment>>(`/admin/finance/payments${toQuery(params)}`);
}

export function listFinanceBatches() {
  return apiRequest<{ items: FinanceBatch[] }>("/admin/finance/reconciliation-batches");
}

export function createFinanceBatch() {
  return apiRequest<FinanceBatch>("/admin/finance/reconciliation-batches", {
    method: "POST"
  });
}

export function listProductCategories() {
  return apiRequest<{ items: ProductCategory[] }>("/admin/mall/categories");
}

export function createProductCategory(input: Record<string, unknown>) {
  return apiRequest<ProductCategory>("/admin/mall/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listProducts(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<Product>>(`/admin/mall/products${toQuery(params)}`);
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

export function listMallOrders(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<MallOrder>>(`/admin/mall/orders${toQuery(params)}`);
}
