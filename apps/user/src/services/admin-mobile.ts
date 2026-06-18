import { API_BASE_URL } from "@/config/app";
import { ensureLogin } from "./auth";
import { request } from "./request";

const ADMIN_TOKEN_STORAGE_KEY = "conference_mobile_admin_token";
const ADMIN_PROFILE_STORAGE_KEY = "conference_mobile_admin_profile";

export type NotificationChannelType = "MOCK" | "WECHAT_SUBSCRIBE" | "SMS";
export type NotificationTemplateStatus = "DRAFT" | "ACTIVE" | "DISABLED";
export type NotificationTaskStatus = "DRAFT" | "PENDING" | "SENDING" | "SENT" | "PARTIAL_FAILED" | "FAILED" | "CANCELLED" | "SKIPPED";
export type NotificationLogStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface MobileAdminUser {
  id: string;
  username: string;
  displayName: string | null;
  permissions?: string[];
}

export interface MobileAdminBinding {
  id: string;
  adminUserId: string;
  userId: string;
  openid: string | null;
  enabled: boolean;
  boundAt: string;
  lastSessionAt: string | null;
}

export interface MobileAdminSession {
  token: string;
  admin: MobileAdminUser;
  binding: MobileAdminBinding;
}

export interface ApiList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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
  sentAt: string | null;
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
  channel: NotificationChannelType;
  recipient: string | null;
  status: NotificationLogStatus;
  errorMessage: string | null;
  createdAt: string;
  task?: { id: string; name: string } | null;
  template?: { id: string; code: string; name: string } | null;
}

export function getMobileAdminToken(): string {
  return String(uni.getStorageSync(ADMIN_TOKEN_STORAGE_KEY) || "");
}

export function getStoredMobileAdmin(): MobileAdminUser | null {
  const admin = uni.getStorageSync(ADMIN_PROFILE_STORAGE_KEY);
  return admin && typeof admin === "object" ? (admin as MobileAdminUser) : null;
}

export function clearMobileAdminSession(): void {
  uni.removeStorageSync(ADMIN_TOKEN_STORAGE_KEY);
  uni.removeStorageSync(ADMIN_PROFILE_STORAGE_KEY);
}

export async function loginAndBindMobileAdmin(username: string, password: string): Promise<MobileAdminSession> {
  await ensureLogin();
  const session = await request<MobileAdminSession>("/admin/mobile/login-and-bind", {
    method: "POST",
    data: { username, password },
    auth: true
  });
  setMobileAdminSession(session);
  return session;
}

export async function createMobileAdminSession(): Promise<MobileAdminSession> {
  await ensureLogin();
  const session = await request<MobileAdminSession>("/admin/mobile/session", {
    method: "POST",
    auth: true
  });
  setMobileAdminSession(session);
  return session;
}

export async function ensureMobileAdminSession(): Promise<string> {
  const token = getMobileAdminToken();
  if (token) return token;
  return (await createMobileAdminSession()).token;
}

export function listNotificationTemplates() {
  return adminRequest<ApiList<NotificationTemplate>>("/admin/notification-templates?page=1&pageSize=100");
}

export function listNotificationTasks() {
  return adminRequest<ApiList<NotificationTask>>("/admin/notification-tasks?page=1&pageSize=100");
}

export function listNotificationLogs(taskId?: string) {
  return adminRequest<ApiList<NotificationLog>>(`/admin/notification-logs?page=1&pageSize=100${taskId ? `&taskId=${encodeURIComponent(taskId)}` : ""}`);
}

export function sendNotificationTaskNow(id: string) {
  return adminRequest<{
    task: NotificationTask;
    result: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }>(`/admin/notification-tasks/${encodeURIComponent(id)}/send-now`, "POST");
}

export function scanCheckinCredential(qrPayload: string) {
  return adminRequest<{
    status: string;
    message: string;
    registrationNo: string;
    attendeeName: string;
    checkedInAt: string | null;
  }>("/checkin/scan", "POST", { qrPayload });
}

function setMobileAdminSession(session: MobileAdminSession): void {
  uni.setStorageSync(ADMIN_TOKEN_STORAGE_KEY, session.token);
  uni.setStorageSync(ADMIN_PROFILE_STORAGE_KEY, session.admin);
}

function adminRequest<T>(path: string, method: "GET" | "POST" = "GET", data?: unknown): Promise<T> {
  const token = getMobileAdminToken();
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data: data as UniApp.RequestOptions["data"],
      header: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      success: (response) => {
        const body = response.data as { code?: string; message?: string; data?: T } | undefined;
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === "OK") {
          resolve(body.data as T);
          return;
        }
        reject(new Error(body?.message || `请求失败 (${response.statusCode})`));
      },
      fail: (error) => reject(new Error(error.errMsg || "网络请求失败"))
    });
  });
}
