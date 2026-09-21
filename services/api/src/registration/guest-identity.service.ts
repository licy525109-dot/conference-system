import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "../admin/current-admin";
import { createCheckinCredentialPayload } from "../checkin/checkin-credential";

const ok = <T>(data: T) => ({ code: "OK", message: "ok", data });
export function identityText(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label}不能为空且不能超过 ${max} 字`);
  return value.trim();
}
export function hashGuestClaim(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function assertAttendeeEditable(attendee: { checkInStatus: string; registration: { status: string; order: { refunds: { status: string }[] } } }) {
  if (attendee.registration.status !== "CONFIRMED") throw new ConflictException("仅有效报名可更换或改绑");
  if (attendee.checkInStatus === "CHECKED_IN") throw new ConflictException("该参会人已签到，请先由管理员核实签到记录");
  if (attendee.checkInStatus === "CANCELLED") throw new ConflictException("参会资格已取消，不能更换或改绑");
  if (attendee.registration.order.refunds.some(r => ["REQUESTED", "APPROVED", "PROCESSING"].includes(r.status))) throw new ConflictException("退款处理中，暂不能更换或改绑");
}

@Injectable()
export class GuestIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async details(registrationId: string) {
    const registration = await this.prisma.registration.findUnique({ where: { id: registrationId }, select: {
      id: true, userId: true, order: { select: { id: true, userId: true, businessOwnerUserId: true,
        submittedFormJson: true, registrationSnapshotJson: true } },
      attendees: { include: { guestProfile: { select: { id: true, userId: true } } } }
    } });
    if (!registration) throw new NotFoundException("报名不存在");
    return ok(registration);
  }

  async updateAttendee(id: string, body: Record<string, unknown>, admin: CurrentAdmin) {
    if (!body || typeof body !== "object") throw new BadRequestException("请求格式错误");
    const reason = identityText(body.reason, "变更原因");
    const action = body.action;
    if (!["bind", "unbind", "replace", "invite"].includes(String(action))) throw new BadRequestException("不支持的操作");
    return this.prisma.$transaction(async tx => {
      const attendee = await tx.registrationAttendee.findUnique({ where: { id }, include: {
        guestProfile: true, registration: { include: { conference: true, order: { include: { refunds: true } }, attendees: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1 } } }
      } });
      if (!attendee) throw new NotFoundException("参会人不存在");
      if (attendee.updatedAt.toISOString() !== body.expectedUpdatedAt) throw new ConflictException("记录已更新，请刷新后再操作");
      assertAttendeeEditable(attendee);
      let guestProfileId: string;
      let claimToken: string | undefined;
      let data: Prisma.RegistrationAttendeeUncheckedUpdateInput = {};
      if (action === "bind") {
        const userId = identityText(body.userId, "用户编号", 100);
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user?.realName || !user.phone || !user.phoneVerifiedAt) throw new ConflictException("目标账号需先填写本人姓名并验证手机号");
        const profile = await tx.guestProfile.upsert({ where: { userId }, update: {}, create: {
          userId, name: user.realName, phone: user.phone, boundAt: new Date()
        } });
        guestProfileId = profile.id;
      } else {
        const name = action === "replace" ? identityText(body.name, "参会人姓名", 80) : attendee.name;
        const phone = action === "replace" ? identityText(body.phone, "参会人手机号", 20) : attendee.phone;
        if (action === "replace" && !/^1\d{10}$/.test(phone)) throw new BadRequestException("请输入有效手机号");
        const profile = await tx.guestProfile.create({ data: { name, phone } });
        guestProfileId = profile.id;
        if (action === "replace") {
          data = { name, phone, company: null, title: null, formDataJson: { name, phone }, checkedInAt: null, checkedInBy: null };
          // A new person must not inherit the previous person's published itinerary.
          await tx.guestScheduleAssignment.updateMany({ where: { attendeeId: id }, data: { archivedAt: new Date() } });
        }
        if (action === "invite") {
          claimToken = randomBytes(32).toString("base64url");
          await tx.guestClaim.create({ data: { guestProfileId, tokenHash: hashGuestClaim(claimToken), expiresAt: new Date(Date.now() + 24 * 3600_000) } });
        }
      }
      await tx.registrationAttendee.update({ where: { id }, data: { ...data, guestProfileId } });
      await tx.registration.update({ where: { id: attendee.registrationId }, data: {
        credentialVersion: { increment: 1 },
        ...(action === "replace" && attendee.registration.attendees[0]?.id === id ? { attendeeName: String(data.name), phone: String(data.phone) } : {})
      } });
      await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.UPDATE, entityType: "Registration", entityId: attendee.registrationId,
        summary: `参会人${action}：${reason}`, metadataJson: { attendeeId: id, previousGuestProfileId: attendee.guestProfileId,
          guestProfileId, previousName: attendee.name, previousPhone: attendee.phone, previousForm: attendee.formDataJson } } });
      return ok({ guestProfileId, ...(claimToken ? { claimToken, expiresInHours: 24 } : {}) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async changeBusinessOwner(orderId: string, body: Record<string, unknown>, admin: CurrentAdmin) {
    if (!body || typeof body !== "object") throw new BadRequestException("请求格式错误");
    const reason = identityText(body.reason, "变更原因");
    const userId = body.userId === null ? null : identityText(body.userId, "用户编号", 100);
    return this.prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.businessOwnerUserId !== (body.expectedUserId ?? null)) throw new ConflictException("归属已变更，请刷新");
      if (userId && !await tx.user.findUnique({ where: { id: userId } })) throw new NotFoundException("目标账号不存在");
      await tx.order.update({ where: { id: orderId }, data: { businessOwnerUserId: userId } });
      await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.UPDATE, entityType: "Order", entityId: orderId,
        summary: `调整业务联系人：${reason}`, metadataJson: { originalUserId: order.userId, previousUserId: order.businessOwnerUserId, userId } } });
      return ok({ userId });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async claim(token: string, userId: string) {
    identityText(token, "领取口令", 100);
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.phoneVerifiedAt || !user.phone || !user.realName) throw new ForbiddenException("请先完善本人姓名和验证手机号");
      const claim = await tx.guestClaim.findUnique({ where: { tokenHash: hashGuestClaim(token) }, include: { guestProfile: { include: { attendees: {
        include: { registration: { include: { order: { include: { refunds: true } } } } }
      } } } } });
      if (!claim || claim.consumedAt || claim.expiresAt <= new Date()) throw new ConflictException("领取口令无效或已过期");
      if (claim.guestProfile.phone !== user.phone) throw new ForbiddenException("当前验证手机号与参会人不一致，请联系会务核对");
      if (claim.guestProfile.userId || !claim.guestProfile.attendees.length) throw new ConflictException("参会人已改绑，请联系会务核对");
      claim.guestProfile.attendees.forEach(assertAttendeeEditable);
      const profile = await tx.guestProfile.upsert({ where: { userId }, update: {}, create: { userId, name: user.realName, phone: user.phone, boundAt: new Date() } });
      await tx.registrationAttendee.updateMany({ where: { guestProfileId: claim.guestProfileId }, data: { guestProfileId: profile.id } });
      await tx.registration.updateMany({ where: { id: { in: [...new Set(claim.guestProfile.attendees.map(a => a.registrationId))] } }, data: { credentialVersion: { increment: 1 } } });
      await tx.guestClaim.update({ where: { id: claim.id }, data: { consumedAt: new Date() } });
      await tx.auditLog.create({ data: { action: AuditAction.UPDATE, entityType: "guest_profile", entityId: profile.id, summary: "参会人验证手机号并确认领取", metadataJson: { userId, claimId: claim.id } } });
      return ok({ claimed: true });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reusableProfiles(userId: string) {
    const [user, attendees] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id: userId }, select: { realName: true, phone: true, guestProfile: true } }),
      this.prisma.registrationAttendee.findMany({ where: { registration: { userId } }, orderBy: { createdAt: "desc" }, take: 30,
        select: { id: true, name: true, phone: true, company: true, title: true, formDataJson: true,
          registration: { select: { conferenceId: true, conference: { select: { title: true } } } } } })
    ]);
    return ok({ user, attendees });
  }

  async mine(userId: string) {
    const items = await this.prisma.registrationAttendee.findMany({ where: { guestProfile: { userId } }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, name: true, phone: true, company: true, title: true, formDataJson: true, checkInStatus: true,
        registration: { select: { id: true, registrationNo: true, status: true, credentialVersion: true,
          conference: { select: { id: true, title: true, startsAt: true, endsAt: true, location: true } } } } }
    });
    return ok({ items: items.map(item => ({ ...item, qrPayload: item.registration.status === "CONFIRMED" && ["PENDING", "CHECKED_IN"].includes(item.checkInStatus)
      ? createCheckinCredentialPayload(item.registration.id, item.registration.registrationNo, item.registration.credentialVersion, item.id) : null })) });
  }
}
