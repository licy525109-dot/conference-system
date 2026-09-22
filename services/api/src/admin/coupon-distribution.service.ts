import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuditAction, Coupon, CouponClaimStatus, CouponRedemptionStatus, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { CurrentUser } from "../auth/current-user";
import { WechatAuthService } from "../auth/wechat-auth.service";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret } from "../wecom/wecom.crypto";
import { CurrentAdmin } from "./current-admin";

const userSelect = { id: true, realName: true, nickname: true, phone: true } as const;
const include = { coupon: { include: { conference: { select: { title: true } } } }, targetUser: { select: userSelect }, claimUser: { select: userSelect } } as const;
type Distribution = Prisma.CouponDistributionGetPayload<{ include: typeof include }>;
const activeRedemptions = [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED];
const ok = <T>(data: T) => ({ code: "OK", message: "ok", data });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const maskedPhone = (value: string | null) => value ? `${value.slice(0, 3)}****${value.slice(-4)}` : null;

@Injectable()
export class CouponDistributionService {
  constructor(private readonly prisma: PrismaService, private readonly wechat: WechatAuthService) {}

  async list(query: Record<string, unknown>) {
    const page = positiveInt(query.page, 1, 100000);
    const pageSize = positiveInt(query.pageSize, 20, 100);
    const where: Prisma.CouponDistributionWhereInput = {
      ...(query.couponId ? { couponId: text(query.couponId, "优惠券编号", 100) } : {}),
      ...(query.userId ? { OR: [{ targetUserId: text(query.userId, "用户编号", 100) }, { claimUserId: text(query.userId, "用户编号", 100) }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.couponDistribution.findMany({ where, include, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.couponDistribution.count({ where })
    ]);
    return ok({ items: items.map(item => this.summary(item)), total, page, pageSize });
  }

  async create(input: unknown, admin: CurrentAdmin) {
    const body = object(input);
    const couponId = text(body.couponId, "优惠券编号", 100);
    const targetUserId = body.targetUserId ? text(body.targetUserId, "用户编号", 100) : null;
    const targetPhone = body.targetPhone ? text(body.targetPhone, "手机号", 20) : null;
    if (Boolean(targetUserId) === Boolean(targetPhone)) throw new BadRequestException("请选择账号或指定手机号，两种方式只能选择一种");
    if (targetPhone && !/^1[3-9]\d{9}$/.test(targetPhone)) throw new BadRequestException("请输入有效的 11 位手机号");
    const idempotencyKey = text(body.idempotencyKey, "请求编号", 100);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new BadRequestException("请求编号无效，请重新操作");
    const hours = body.expiresInHours === undefined ? 24 : body.expiresInHours;
    if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 168) throw new BadRequestException("领取有效期须为 1 至 168 小时");
    const remark = body.remark ? text(body.remark, "发放备注", 200) : null;
    const requestHash = hash(JSON.stringify({ couponId, targetUserId, targetPhone, hours, remark }));

    return this.transaction(async tx => {
      const repeated = await tx.couponDistribution.findUnique({ where: { createdByAdminId_idempotencyKey: { createdByAdminId: admin.id, idempotencyKey } }, include });
      if (repeated) {
        if (repeated.requestHash !== requestHash) throw new ConflictException("该请求已用于其他发放操作，请重新确认收券人");
        return ok(this.summary(repeated));
      }
      const now = new Date();
      const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
      assertAvailable(coupon, now);
      if (coupon.perUserLimit !== 1) throw new ConflictException("定向券须设置每人限用 1 次，请先调整优惠券配置");
      if (await tx.couponCampaignCoupon.count({ where: { couponId } })) throw new ConflictException("该券已关联公开领券活动，请新建独立的定向优惠券");
      const targetUser = targetUserId ? await tx.user.findUnique({ where: { id: targetUserId } }) : null;
      if (targetUserId && !targetUser) throw new NotFoundException("收券账号不存在，请重新选择");
      const recipientIds = targetUserId ? [targetUserId] : (await tx.user.findMany({ where: { phone: targetPhone, phoneVerifiedAt: { not: null } }, select: { id: true } })).map(user => user.id);
      if (recipientIds.length) {
        const [owned, registrationUsed, mallUsed] = await Promise.all([
          tx.couponClaim.count({ where: { couponId, userId: { in: recipientIds } } }),
          tx.couponRedemption.count({ where: { couponId, userId: { in: recipientIds }, status: { in: activeRedemptions } } }),
          tx.mallCouponRedemption.count({ where: { couponId, userId: { in: recipientIds }, status: { in: activeRedemptions } } })
        ]);
        if (owned || registrationUsed || mallUsed) throw new ConflictException("该接收人已领取过或使用过这张优惠券，请查看已有优惠券及使用记录");
      }
      const existing = await tx.couponDistribution.findFirst({ where: { couponId, claimedAt: null, revokedAt: null, expiresAt: { gt: now },
        ...(targetPhone ? { targetPhone } : { OR: [{ targetUserId }, ...(targetUser?.phoneVerifiedAt && targetUser.phone ? [{ targetPhone: targetUser.phone }] : [])] }) }, include });
      if (existing) throw new ConflictException("该接收人已有待领取邀请，请到发放记录生成链接或撤销原邀请");
      await this.checkCapacity(tx, coupon, now);
      // Require ownership even before the first invitation has been claimed.
      await tx.coupon.update({ where: { id: couponId }, data: { requiresClaim: true } });
      const token = targetPhone ? randomBytes(32).toString("base64url") : null;
      const expiresAt = new Date(Math.min(now.getTime() + hours * 3600000, coupon.endAt?.getTime() ?? Infinity));
      if (expiresAt.getTime() <= now.getTime() + 60000) throw new ConflictException("优惠券即将到期，不能发放");
      const distribution = await tx.couponDistribution.create({ data: {
        couponId, targetUserId, targetPhone, idempotencyKey, requestHash, createdByAdminId: admin.id, remark, expiresAt,
        tokenHash: token ? hash(token) : null, tokenEncrypted: token ? encryptSecret(token) : null,
        claimedAt: targetUserId ? now : null, claimUserId: targetUserId
      }, include });
      if (targetUserId) await this.assign(tx, distribution, targetUserId);
      await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.CREATE, entityType: "CouponDistribution", entityId: distribution.id,
        summary: targetUserId ? "向指定账号发放优惠券" : "创建指定手机号领券邀请",
        metadataJson: { couponId, targetUserId, targetPhoneMasked: maskedPhone(targetPhone), expiresAt: expiresAt.toISOString() } } });
      return ok(this.summary(distribution));
    });
  }

  async link(id: string) {
    const item = await this.prisma.couponDistribution.findUnique({ where: { id }, include });
    if (!item || distributionStatus(item) !== "PENDING") throw new ConflictException("领取邀请已失效或已领取，不能生成链接");
    assertAvailable(item.coupon, new Date());
    const token = decryptSecret(item.tokenEncrypted);
    if (!validToken(token) || hash(token) !== item.tokenHash) throw new ConflictException("领取凭证不可用，请撤销后重新发放");
    const url = await this.wechat.generateCouponClaimLink(token, item.expiresAt);
    // A concurrent claim or cancellation must not be presented as a usable new link.
    const latest = await this.prisma.couponDistribution.findUnique({ where: { id } });
    if (!latest || distributionStatus(latest) !== "PENDING") throw new ConflictException("领取邀请状态已变化，请刷新记录");
    return ok({ url, path: `/pages/coupon/claim?token=${token}`, expiresAt: item.expiresAt.toISOString() });
  }

  async preview(input: unknown) {
    const token = readToken(input);
    const item = await this.prisma.couponDistribution.findUnique({ where: { tokenHash: hash(token) }, include });
    if (!item || !item.targetPhone) throw new NotFoundException("领取入口无效，请联系会务组");
    const skuIds = Array.isArray(item.coupon.allowedSkuIds) ? item.coupon.allowedSkuIds.filter((id): id is string => typeof id === "string") : [];
    const [registrationSkus, productSkus] = skuIds.length ? await Promise.all([
      this.prisma.registrationSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, name: true } }),
      this.prisma.productSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, name: true } })
    ]) : [[], []];
    const skuNames = new Map([...registrationSkus, ...productSkus].map(sku => [sku.id, sku.name]));
    const status = !item.coupon.enabled || item.coupon.deletedAt ? "REVOKED" : item.coupon.endAt && item.coupon.endAt <= new Date() ? "EXPIRED" : distributionStatus(item);
    return ok({ status, targetPhoneMasked: maskedPhone(item.targetPhone), expiresAt: item.expiresAt.toISOString(), coupon: {
      name: item.coupon.name, type: item.coupon.type, discountAmountCent: item.coupon.discountAmountCent,
      discountPercent: item.coupon.discountPercent, conferenceTitle: item.coupon.conference?.title ?? null,
      scope: item.coupon.scope, minAmountCent: item.coupon.minAmountCent, minQuantity: item.coupon.minQuantity,
      maxDiscountCent: item.coupon.maxDiscountCent, startAt: item.coupon.startAt?.toISOString() ?? null,
      allowedSkuNames: skuIds.map(id => skuNames.get(id) ?? "指定规格（已不可用）"),
      endAt: item.coupon.endAt?.toISOString() ?? null
    } });
  }

  async claim(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("请先登录");
    const token = readToken(input);
    return this.transaction(async tx => {
      const item = await tx.couponDistribution.findUnique({ where: { tokenHash: hash(token) }, include });
      if (!item || !item.targetPhone) throw new NotFoundException("领取入口无效，请联系会务组");
      // Identity is read fresh from the database, never from the request or a stale token.
      const user = await tx.user.findUnique({ where: { id: currentUser.id } });
      if (!user?.phoneVerifiedAt || !user.phone) throw new ForbiddenException("请先授权并验证本人手机号后领取");
      if (user.phone !== item.targetPhone) throw new ForbiddenException("当前验证手机号与指定收券人不一致，请联系会务组核对");
      if (item.claimedAt) {
        if (item.claimUserId !== user.id) throw new ConflictException("该优惠券已由其他账号领取，请联系会务组");
        return ok({ id: item.id, status: "CLAIMED" as const, alreadyClaimed: true, couponId: item.couponId });
      }
      const now = new Date();
      if (distributionStatus(item, now) !== "PENDING") throw new ConflictException("领取邀请已过期或已撤销，请联系会务组");
      assertAvailable(item.coupon, now);
      if (await tx.couponClaim.findFirst({ where: { couponId: item.couponId, userId: user.id } })) throw new ConflictException("当前账号已领取过这张优惠券，请到我的优惠券查看");
      await this.checkCapacity(tx, item.coupon, now, item.id);
      const reserved = await tx.couponDistribution.updateMany({ where: { id: item.id, claimedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { claimedAt: now, claimUserId: user.id } });
      if (reserved.count !== 1) throw new ConflictException("领取状态已变化，请重试");
      await this.assign(tx, item, user.id);
      await tx.auditLog.create({ data: { action: AuditAction.UPDATE, entityType: "CouponDistribution", entityId: item.id, summary: "指定嘉宾验证手机号并领取优惠券", metadataJson: { couponId: item.couponId, userId: user.id } } });
      return ok({ id: item.id, status: "CLAIMED" as const, alreadyClaimed: false, couponId: item.couponId });
    });
  }

  async revoke(id: string, admin: CurrentAdmin) {
    return this.transaction(async tx => {
      const item = await tx.couponDistribution.findUnique({ where: { id }, include });
      if (!item) throw new NotFoundException("发放记录不存在");
      if (item.claimedAt) throw new ConflictException("该券已到账，不能撤销领取邀请");
      if (!item.revokedAt) {
        const updated = await tx.couponDistribution.updateMany({ where: { id, claimedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        if (updated.count !== 1) throw new ConflictException("领取状态已变化，请刷新后重试");
        await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.UPDATE, entityType: "CouponDistribution", entityId: id, summary: "撤销未领取的优惠券邀请" } });
      }
      return ok(this.summary((await tx.couponDistribution.findUnique({ where: { id }, include }))!));
    });
  }

  private async checkCapacity(tx: Prisma.TransactionClient, coupon: Coupon, now: Date, excludeId?: string) {
    if (coupon.totalLimit === null) return;
    const claims = await tx.couponClaim.findMany({ where: { couponId: coupon.id }, select: { userId: true } });
    const occupied = new Map<string, number>(claims.map(item => [item.userId, 1]));
    const [reserved, registrationUsed, mallUsed] = await Promise.all([
      tx.couponDistribution.count({ where: { couponId: coupon.id, claimedAt: null, revokedAt: null, expiresAt: { gt: now }, ...(excludeId ? { id: { not: excludeId } } : {}) } }),
      tx.couponRedemption.findMany({ where: { couponId: coupon.id, status: { in: activeRedemptions } }, select: { userId: true } }),
      tx.mallCouponRedemption.findMany({ where: { couponId: coupon.id, status: { in: activeRedemptions } }, select: { userId: true } })
    ]);
    const usage = new Map<string, number>();
    let anonymousUses = 0;
    for (const record of [...registrationUsed, ...mallUsed]) {
      if (!record.userId) anonymousUses++;
      else usage.set(record.userId, (usage.get(record.userId) ?? 0) + 1);
    }
    for (const [userId, count] of usage) occupied.set(userId, Math.max(occupied.get(userId) ?? 0, count));
    const allocated = [...occupied.values()].reduce((sum, count) => sum + count, 0);
    if (allocated + reserved + anonymousUses >= coupon.totalLimit) throw new ConflictException("优惠券可发放额度不足，请检查已领取、待领取及使用记录");
  }

  private async assign(tx: Prisma.TransactionClient, item: Distribution, userId: string) {
    await tx.couponClaim.create({ data: { couponId: item.couponId, distributionId: item.id, userId, status: CouponClaimStatus.CLAIMED } });
    await tx.userNotification.create({ data: { userId, type: "COUPON_RECEIVED", title: "优惠券已到账", summary: `您已收到「${item.coupon.name}」，可在我的优惠券查看。`, route: "/pages/coupon/my", sourceKey: `coupon-distribution:${item.id}` } });
  }

  private summary(item: Distribution) {
    const user = (value: Distribution["targetUser"]) => value ? { ...value, phone: maskedPhone(value.phone) } : null;
    return { id: item.id, couponId: item.couponId, coupon: { id: item.coupon.id, name: item.coupon.name, code: item.coupon.code, conferenceId: item.coupon.conferenceId },
      targetUserId: item.targetUserId, targetUser: user(item.targetUser), targetPhoneMasked: maskedPhone(item.targetPhone),
      claimUserId: item.claimUserId, claimUser: user(item.claimUser), status: distributionStatus(item),
      expiresAt: item.expiresAt.toISOString(), claimedAt: item.claimedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), remark: item.remark };
  }

  private async transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
        if (code === "P2034" || code === "P2002") throw new ConflictException("发放或领取请求正在处理，请稍后重试");
        throw error;
      }
    }
    throw new ConflictException("操作冲突，请重试");
  }
}

export function distributionStatus(item: { claimedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (item.claimedAt) return "CLAIMED" as const;
  if (item.revokedAt) return "REVOKED" as const;
  return item.expiresAt <= now ? "EXPIRED" as const : "PENDING" as const;
}

function assertAvailable(coupon: Coupon | null, now: Date): asserts coupon is Coupon {
  if (!coupon || coupon.deletedAt || !coupon.enabled) throw new ConflictException("优惠券不存在、已删除或已停用");
  if (coupon.endAt && coupon.endAt <= now) throw new ConflictException("优惠券已过期");
}
function validToken(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
function readToken(input: unknown) { const token = object(input).token; if (!validToken(token)) throw new BadRequestException("领取入口无效，请联系会务组"); return token; }
function object(input: unknown): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("请求格式错误"); return input as Record<string, unknown>; }
function text(input: unknown, label: string, max: number) { if (typeof input !== "string" || !input.trim() || input.trim().length > max) throw new BadRequestException(`${label}不能为空或过长`); return input.trim(); }
function positiveInt(value: unknown, fallback: number, max: number) { const number = Number(value ?? fallback); return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback; }
