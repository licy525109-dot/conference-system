import { Prisma } from "@prisma/client";
import { WecomSmartSheetRecord } from "../wecom/adapters/wecom-client.adapter";
import { configuredWideFields, ExistingWideSheetConfig, StatusWritebackKey } from "./smart-sheet-wide-config";

export const STATUS_ATTENDEE_SELECT = {
  id: true, name: true, phone: true, company: true, checkInStatus: true, checkedInAt: true,
  registration: {
    select: {
      registrationNo: true, status: true, source: true,
      order: {
        select: {
          orderNo: true, status: true, payableAmountCent: true, paidAmountCent: true, paidAt: true,
          refunds: { select: { status: true, amountCent: true, createdAt: true } }
        }
      }
    }
  }
} satisfies Prisma.RegistrationAttendeeSelect;

export type StatusAttendee = Prisma.RegistrationAttendeeGetPayload<{ select: typeof STATUS_ATTENDEE_SELECT }>;
type Identity = Pick<StatusAttendee, "id" | "name" | "phone" | "company">;
type Binding = { attendeeId: string; remoteRecordId: string | null };
type Update = { record_id: string; values: Record<string, unknown> };

export function emptyStatusWritebackResult(enabled = false) {
  return {
    enabled, readCount: 0, updatedCount: 0, unchangedCount: 0, skippedCount: 0, errorCount: 0,
    errors: [] as string[],
    issues: [] as Array<{ attendeeId: string; registrationNo: string; reason: string }>
  };
}

export function validateStatusWriteback(
  config: ExistingWideSheetConfig,
  fields?: Array<{ title: string; type: string }>
): string[] {
  if (!config.statusWriteback.enabled) return [];
  const selected = Object.values(config.statusWriteback.fields).filter(Boolean);
  const issues: string[] = [];
  if (!selected.length) issues.push("状态回写至少选择一列");
  if (new Set(selected).size !== selected.length) issues.push("不同状态不能写入同一列");
  const reserved = new Set(configuredWideFields({
    ...config, statusWriteback: { ...config.statusWriteback, enabled: false }
  }));
  if (selected.some((title) => reserved.has(title))) {
    issues.push("状态回写列不能与嘉宾匹配、报名写入或现场事项列重复");
  }
  if (!config.identity.attendeeIdField && !config.identity.phoneField
    && !(config.identity.nameField && config.identity.companyField)) {
    issues.push("状态回写缺少可核对的嘉宾匹配列");
  }
  if (fields) {
    for (const title of [...new Set([...selected, ...Object.values(config.identity).filter(Boolean)])]) {
      const matches = fields.filter((field) => field.title === title);
      if (matches.length !== 1) issues.push(`状态回写所需列不存在或不唯一：${title}`);
      else if (selected.includes(title) && !isStatusTextField(matches[0]!.type)) {
        issues.push(`状态回写只支持文本列：${title}`);
      }
    }
  }
  return issues;
}

export function isStatusTextField(type: string): boolean {
  return ["text", "FIELD_TYPE_TEXT"].includes(type);
}

export function readSmartSheetCellText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readSmartSheetCellText).filter(Boolean).join("、");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "value", "title", "name"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
      if (typeof record[key] === "number") return String(record[key]);
    }
  }
  return "";
}

// Both sides must be unique; a stored row ID alone is not proof of current ownership.
export function buildStatusIdentityMatcher(
  config: ExistingWideSheetConfig, attendees: Identity[], records: WecomSmartSheetRecord[]
): (attendee: Identity, record: WecomSmartSheetRecord) => boolean {
  const { attendeeIdField, phoneField, nameField, companyField } = config.identity;
  const phone = (value: string) => value.replace(/[\s()-]/g, "").replace(/^\+86/, "");
  const nameCompany = (name: string, company: string) => name && company ? JSON.stringify([name.trim(), company.trim()]) : "";
  const cell = (row: WecomSmartSheetRecord, field: string) => field ? readSmartSheetCellText(row.values?.[field]) : "";
  const localIds = counts(attendees.map((a) => a.id));
  const remoteIds = counts(records.map((r) => cell(r, attendeeIdField)));
  const localPhones = counts(attendees.map((a) => phone(a.phone)));
  const remotePhones = counts(records.map((r) => phone(cell(r, phoneField))));
  const localNames = counts(attendees.map((a) => nameCompany(a.name, a.company || "")));
  const remoteNames = counts(records.map((r) => nameCompany(cell(r, nameField), cell(r, companyField))));
  return (attendee, record) => {
    const id = cell(record, attendeeIdField);
    if (id) return id === attendee.id && localIds.get(id) === 1 && remoteIds.get(id) === 1;
    const remotePhone = phone(cell(record, phoneField));
    if (remotePhone) {
      const name = cell(record, nameField);
      return remotePhone === phone(attendee.phone)
        && localPhones.get(remotePhone) === 1 && remotePhones.get(remotePhone) === 1
        && (!name || name === attendee.name.trim());
    }
    const key = nameCompany(cell(record, nameField), cell(record, companyField));
    return Boolean(key && key === nameCompany(attendee.name, attendee.company || "")
      && localNames.get(key) === 1 && remoteNames.get(key) === 1);
  };
}

export async function writeSmartSheetStatuses(input: {
  config: ExistingWideSheetConfig;
  fields: Array<{ title: string; type: string }>;
  attendees: StatusAttendee[];
  records: WecomSmartSheetRecord[];
  bindings: Binding[];
  updateRecords: (records: Update[]) => Promise<void>;
}) {
  const { config, fields, attendees, records, bindings, updateRecords } = input;
  const result = emptyStatusWritebackResult(config.statusWriteback.enabled);
  if (!result.enabled) return result;
  const configErrors = validateStatusWriteback(config, fields);
  if (configErrors.length) {
    result.errors = configErrors;
    result.errorCount = configErrors.length;
    return result;
  }
  const matches = buildStatusIdentityMatcher(config, attendees, records);
  const rowIds = counts(records.map((r) => r.record_id));
  const boundRowIds = counts(bindings.map((b) => b.remoteRecordId || ""));
  const boundAttendeeIds = counts(bindings.map((b) => b.attendeeId));
  const byRow = new Map(records.map((r) => [r.record_id, r]));
  const byAttendee = new Map(bindings.map((b) => [b.attendeeId, b]));
  const pending: Array<{ attendee: StatusAttendee; update: Update }> = [];
  const recordIssue = (attendee: StatusAttendee, reason: string) => {
    result.errorCount += 1;
    if (result.issues.length < 20) result.issues.push({
      attendeeId: attendee.id, registrationNo: attendee.registration.registrationNo, reason
    });
  };
  for (const attendee of attendees) {
    result.readCount += 1;
    const binding = byAttendee.get(attendee.id);
    const row = binding?.remoteRecordId ? byRow.get(binding.remoteRecordId) : undefined;
    let reason = "";
    if (!binding?.remoteRecordId) reason = "尚未绑定智能表记录";
    else if (!row) reason = "绑定的智能表记录已不存在";
    else if (boundAttendeeIds.get(attendee.id) !== 1 || boundRowIds.get(row.record_id) !== 1 || rowIds.get(row.record_id) !== 1) {
      reason = "智能表绑定不唯一";
    } else if (!matches(attendee, row)) reason = "身份不一致或不唯一，请核对系统参会人 ID";
    if (reason || !row) {
      result.skippedCount += 1;
      recordIssue(attendee, reason);
      continue;
    }
    const desired = attendeeStatusValues(attendee);
    const values: Record<string, unknown> = {};
    for (const [key, title] of Object.entries(config.statusWriteback.fields)) {
      if (!title) continue;
      const text = desired[key as StatusWritebackKey];
      if (readSmartSheetCellText(row.values?.[title]) !== text) {
        values[title] = [{ type: "text", text }];
      }
    }
    if (Object.keys(values).length) pending.push({ attendee, update: { record_id: row.record_id, values } });
    else result.unchangedCount += 1;
  }
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending.slice(offset, offset + 100);
    try {
      await updateRecords(batch.map((item) => item.update));
      result.updatedCount += batch.length;
    } catch {
      // Never persist raw gateway errors: they may contain document tokens or cell values.
      batch.forEach(({ attendee }) => recordIssue(attendee, "状态写入失败，将在下一轮重试；请检查文档编辑权限和网络"));
    }
  }
  if (result.errorCount) result.errors.push(`${result.errorCount} 项状态未回写，请查看同步记录并核对绑定或编辑权限`);
  return result;
}

export function attendeeStatusValues(attendee: StatusAttendee): Record<StatusWritebackKey, string> {
  const { registration } = attendee;
  const { order } = registration;
  const refunded = order.refunds.filter((r) => r.status === "SUCCESS").reduce((sum, r) => sum + r.amountCent, 0);
  const total = order.paidAmountCent ?? order.payableAmountCent;
  const fullRefund = order.status === "REFUNDED" || (total > 0 && refunded >= total);
  const pending = order.refunds.some((r) => ["APPROVED", "PROCESSING"].includes(r.status));
  const requested = order.refunds.some((r) => r.status === "REQUESTED");
  const latestRefund = [...order.refunds].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  let refundStatus = fullRefund ? "已全额退款" : refunded > 0 ? "已部分退款" : "未退款";
  if (!fullRefund) {
    const progress = pending ? "退款处理中" : requested ? "退款申请中"
      : latestRefund?.status === "FAILED" ? "退款失败" : latestRefund?.status === "REJECTED" ? "退款申请已拒绝" : "";
    if (progress) refundStatus = refunded > 0 ? `${refundStatus}，${progress}` : progress;
  }
  const complimentary = registration.source === "ADMIN_COMPLIMENTARY";
  return {
    checkInStatus: { NOT_REQUIRED: "无需签到", PENDING: "未签到", CHECKED_IN: "已签到", CANCELLED: "已取消" }[attendee.checkInStatus],
    checkedInAt: attendee.checkInStatus === "CHECKED_IN" ? beijingTime(attendee.checkedInAt) : "",
    registrationStatus: { CONFIRMED: "已确认", CANCELLED: "已取消", REFUNDED: "已退款" }[registration.status],
    orderNo: order.orderNo,
    paymentStatus: fullRefund ? "已退款" : complimentary ? "主办方邀请（免付费）"
      : order.status === "PAID" && order.payableAmountCent === 0 ? "无需支付"
      : { PENDING: "待支付", PAID: "已支付", CANCELLED: "已取消", CLOSED: "已关闭", REFUNDED: "已退款" }[order.status],
    paidAt: !complimentary && total > 0 ? beijingTime(order.paidAt) : "",
    refundStatus
  };
}

function beijingTime(date: Date | null): string {
  if (!date || !Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

function counts(keys: string[]): Map<string, number> {
  const result = new Map<string, number>();
  keys.filter(Boolean).forEach((key) => result.set(key, (result.get(key) || 0) + 1));
  return result;
}
