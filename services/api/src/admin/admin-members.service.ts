import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

const MEMBERSHIP_STATUSES = new Set(["ACTIVE", "EXPIRED", "DISABLED", "CANCELLED"]);
const MEMBERSHIP_SOURCES = new Set(["ADMIN_GRANT", "IMPORT", "REGISTRATION_REWARD", "MANUAL_ADJUST", "PURCHASE_PENDING"]);
const BENEFIT_TYPES = new Set(["TEXT", "DISCOUNT", "COUPON", "ACCESS", "SERVICE", "WE_COM_GROUP", "CUSTOM"]);
const GRANT_STATUSES = new Set(["GRANTED", "USED", "EXPIRED", "REVOKED", "FAILED"]);

@Injectable()
export class AdminMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async listLevels() {
    const items = await this.prisma.memberLevel.findMany({
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      include: {
        benefits: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        _count: { select: { benefits: true, memberships: true, priceRules: true } }
      }
    });
    return ok({ items: items.map(formatLevel) });
  }

  async levelOptions() {
    const items = await this.prisma.memberLevel.findMany({
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      select: { id: true, code: true, name: true, enabled: true, defaultDays: true, pricingEnabled: true }
    });
    return ok({ items });
  }

  async createLevel(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const level = await this.prisma.memberLevel.create({
      data: {
        code: readCode(body, "code"),
        name: readRequiredString(body, "name"),
        description: readNullableString(body.description),
        rank: readOptionalInt(body, "rank") ?? 0,
        priceCent: readOptionalNonNegativeInt(body, "priceCent") ?? 0,
        discountPercent: readOptionalPercent(body, "discountPercent"),
        defaultDays: readOptionalPositiveInt(body, "defaultDays"),
        pricingEnabled: readOptionalBoolean(body, "pricingEnabled") ?? true,
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        benefitsJson: readNullableObject(body.benefitsJson)
      },
      include: { benefits: true, _count: { select: { benefits: true, memberships: true, priceRules: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MemberLevel", level.id, "Create member level", { code: level.code });
    return ok(formatLevel(level));
  }

  async updateLevel(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const existing = await this.prisma.memberLevel.findUnique({ where: { id }, include: { _count: { select: { memberships: true } } } });
    if (!existing) throw new NotFoundException("Member level not found");
    const level = await this.prisma.memberLevel.update({
      where: { id },
      data: {
        ...(typeof body.code !== "undefined" ? { code: readCode(body, "code") } : {}),
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
        ...(typeof body.rank !== "undefined" ? { rank: readRequiredInt(body, "rank") } : {}),
        ...(typeof body.priceCent !== "undefined" ? { priceCent: readRequiredNonNegativeInt(body, "priceCent") } : {}),
        ...(typeof body.discountPercent !== "undefined" ? { discountPercent: readOptionalPercent(body, "discountPercent") } : {}),
        ...(typeof body.defaultDays !== "undefined" ? { defaultDays: readOptionalPositiveInt(body, "defaultDays") } : {}),
        ...(typeof body.pricingEnabled !== "undefined" ? { pricingEnabled: readRequiredBoolean(body.pricingEnabled, "pricingEnabled") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.benefitsJson !== "undefined" ? { benefitsJson: readNullableObject(body.benefitsJson) } : {})
      },
      include: {
        benefits: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        _count: { select: { benefits: true, memberships: true, priceRules: true } }
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MemberLevel", id, "Update member level", {
      code: level.code,
      memberCount: existing._count.memberships,
      disabledRule: level.enabled ? "enabled" : "disabled levels cannot be granted to new members or match new member pricing"
    });
    return ok(formatLevel(level));
  }

  async listMemberships(query: Record<string, unknown>) {
    const page = readOptionalPositiveInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalPositiveInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const status = readOptionalString(query, "status");
    const levelId = readOptionalString(query, "levelId");
    const expiresBefore = readOptionalDate(query, "expiresBefore");
    const expiresAfter = readOptionalDate(query, "expiresAfter");
    const now = new Date();
    const where: Prisma.UserMembershipWhereInput = {
      ...(levelId ? { levelId } : {}),
      ...(status && status !== "EXPIRED"
        ? { status }
        : status === "EXPIRED"
          ? { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lt: now } }] }
          : {}),
      ...(expiresBefore || expiresAfter ? { endsAt: { ...(expiresBefore ? { lte: expiresBefore } : {}), ...(expiresAfter ? { gte: expiresAfter } : {}) } } : {}),
      ...(keyword
        ? {
            OR: [
              { user: { nickname: { contains: keyword, mode: "insensitive" } } },
              { user: { wechatNickname: { contains: keyword, mode: "insensitive" } } },
              { user: { phone: { contains: keyword, mode: "insensitive" } } },
              { level: { name: { contains: keyword, mode: "insensitive" } } },
              { level: { code: { contains: keyword, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userMembership.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: true,
          level: true,
          benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }], take: 20 }
        }
      }),
      this.prisma.userMembership.count({ where })
    ]);
    return ok({ items: items.map(formatMembership), total, page, pageSize });
  }

  async grantMembership(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const userId = readRequiredString(body, "userId");
    const levelId = readRequiredString(body, "levelId");
    const level = await this.requireEnabledLevel(levelId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");
    const startsAt = readOptionalDate(body, "startsAt") ?? new Date();
    const endsAt = resolveMembershipEndAt(startsAt, readOptionalDate(body, "endsAt"), readOptionalPositiveInt(body, "durationDays") ?? level.defaultDays ?? undefined);
    const source = readEnum(body, "source", MEMBERSHIP_SOURCES) ?? "ADMIN_GRANT";
    const membership = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userMembership.create({
        data: {
          userId,
          levelId,
          status: "ACTIVE",
          startsAt,
          endsAt,
          source,
          remark: readNullableString(body.remark)
        },
        include: { user: true, level: true, benefitGrants: { include: { benefit: true } } }
      });
      await this.grantAutoBenefits(tx, created.id, userId, levelId, endsAt, "AUTO_GRANT", readNullableString(body.remark));
      return tx.userMembership.findUniqueOrThrow({
        where: { id: created.id },
        include: { user: true, level: true, benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }] } }
      });
    });
    await this.writeAudit(admin, AuditAction.CREATE, "UserMembership", membership.id, "Grant membership", { userId, levelId, source });
    return ok(formatMembership(membership));
  }

  async renewMembership(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const current = await this.prisma.userMembership.findUnique({ where: { id }, include: { level: true } });
    if (!current) throw new NotFoundException("Membership not found");
    if (!current.level.enabled) throw new ConflictException("Member level is disabled and cannot be renewed");
    const now = new Date();
    const base = current.endsAt && current.endsAt > now ? current.endsAt : now;
    const durationDays = readOptionalPositiveInt(body, "durationDays") ?? current.level.defaultDays ?? 365;
    const endsAt = addDays(base, durationDays);
    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.userMembership.update({
        where: { id },
        data: {
          status: "ACTIVE",
          endsAt,
          renewedAt: now,
          disabledAt: null,
          disabledReason: null,
          source: "MANUAL_ADJUST",
          remark: readNullableString(body.remark) ?? current.remark
        }
      });
      await this.grantAutoBenefits(tx, id, current.userId, current.levelId, endsAt, "RENEWAL", readNullableString(body.remark));
      await tx.memberBenefitGrant.updateMany({
        where: { membershipId: id, status: { in: ["GRANTED", "EXPIRED"] } },
        data: { expiredAt: endsAt, status: "GRANTED" }
      });
      return tx.userMembership.findUniqueOrThrow({
        where: { id },
        include: { user: true, level: true, benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }] } }
      });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "UserMembership", id, "Renew membership", { durationDays, endsAt: endsAt.toISOString() });
    return ok(formatMembership(membership));
  }

  async disableMembership(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const reason = readOptionalString(body, "reason") ?? "后台停用会员";
    const now = new Date();
    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.userMembership.update({
        where: { id },
        data: { status: "DISABLED", disabledAt: now, disabledReason: reason, remark: readNullableString(body.remark) ?? reason }
      });
      await tx.memberBenefitGrant.updateMany({
        where: { membershipId: id, status: "GRANTED" },
        data: { status: "REVOKED", remark: reason }
      });
      return tx.userMembership.findUniqueOrThrow({
        where: { id },
        include: { user: true, level: true, benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }] } }
      });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "UserMembership", id, "Disable membership", { reason });
    return ok(formatMembership(membership));
  }

  async changeMembershipLevel(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const levelId = readRequiredString(body, "levelId");
    await this.requireEnabledLevel(levelId);
    const current = await this.prisma.userMembership.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Membership not found");
    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.userMembership.update({
        where: { id },
        data: { levelId, status: "ACTIVE", source: "MANUAL_ADJUST", remark: readNullableString(body.remark) ?? current.remark }
      });
      await this.grantAutoBenefits(tx, id, current.userId, levelId, current.endsAt, "LEVEL_ADJUST", readNullableString(body.remark));
      return tx.userMembership.findUniqueOrThrow({
        where: { id },
        include: { user: true, level: true, benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }] } }
      });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "UserMembership", id, "Change membership level", { fromLevelId: current.levelId, toLevelId: levelId });
    return ok(formatMembership(membership));
  }

  async listBenefits(query: Record<string, unknown>) {
    const levelId = readOptionalString(query, "levelId");
    const enabled = readOptionalBoolean(query, "enabled");
    const visible = readOptionalBoolean(query, "visible");
    const items = await this.prisma.memberBenefit.findMany({
      where: { ...(levelId ? { levelId } : {}), ...(typeof enabled === "boolean" ? { enabled } : {}), ...(typeof visible === "boolean" ? { visible } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { level: true, _count: { select: { grants: true } } }
    });
    return ok({ items: items.map(formatBenefit) });
  }

  async benefitOptions(query: Record<string, unknown>) {
    const levelId = readOptionalString(query, "levelId");
    const items = await this.prisma.memberBenefit.findMany({
      where: { enabled: true, ...(levelId ? { levelId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, levelId: true, title: true, type: true, autoGrant: true, visible: true, enabled: true }
    });
    return ok({ items });
  }

  async createBenefit(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const levelId = readRequiredString(body, "levelId");
    await this.requireLevel(levelId);
    const item = await this.prisma.memberBenefit.create({
      data: buildBenefitData(body, levelId),
      include: { level: true, _count: { select: { grants: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MemberBenefit", item.id, "Create member benefit", { levelId: item.levelId, autoGrant: item.autoGrant });
    return ok(formatBenefit(item));
  }

  async updateBenefit(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const data = buildBenefitUpdateData(body);
    if (data.levelId) await this.requireLevel(data.levelId as string);
    const item = await this.prisma.memberBenefit.update({
      where: { id },
      data,
      include: { level: true, _count: { select: { grants: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MemberBenefit", id, "Update member benefit", { levelId: item.levelId, enabled: item.enabled });
    return ok(formatBenefit(item));
  }

  async listBenefitGrants(query: Record<string, unknown>) {
    const page = readOptionalPositiveInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalPositiveInt(query, "pageSize") ?? 20, 100);
    const userId = readOptionalString(query, "userId");
    const membershipId = readOptionalString(query, "membershipId");
    const benefitId = readOptionalString(query, "benefitId");
    const status = readOptionalString(query, "status");
    const where: Prisma.MemberBenefitGrantWhereInput = {
      ...(userId ? { userId } : {}),
      ...(membershipId ? { membershipId } : {}),
      ...(benefitId ? { benefitId } : {}),
      ...(status ? { status } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.memberBenefitGrant.findMany({
        where,
        orderBy: [{ grantedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: true, benefit: { include: { level: true } }, membership: { include: { level: true } } }
      }),
      this.prisma.memberBenefitGrant.count({ where })
    ]);
    return ok({ items: items.map(formatBenefitGrant), total, page, pageSize });
  }

  async revokeBenefitGrant(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const grant = await this.prisma.memberBenefitGrant.update({
      where: { id },
      data: { status: "REVOKED", remark: readOptionalString(body, "remark") ?? "后台撤销权益" },
      include: { user: true, benefit: { include: { level: true } }, membership: { include: { level: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MemberBenefitGrant", id, "Revoke member benefit grant", { benefitId: grant.benefitId, userId: grant.userId });
    return ok(formatBenefitGrant(grant));
  }

  async listPriceRules(query: Record<string, unknown>) {
    const levelId = readOptionalString(query, "levelId");
    const conferenceId = readOptionalString(query, "conferenceId");
    const items = await this.prisma.membershipPriceRule.findMany({
      where: { ...(levelId ? { levelId } : {}), ...(conferenceId ? { OR: [{ conferenceId }, { conferenceId: null }] } : {}) },
      orderBy: [{ createdAt: "desc" }],
      include: { level: true }
    });
    return ok({ items: items.map(formatPriceRule) });
  }

  async createPriceRule(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const levelId = readRequiredString(body, "levelId");
    await this.requireLevel(levelId);
    const item = await this.prisma.membershipPriceRule.create({
      data: buildPriceRuleData(body, levelId),
      include: { level: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MembershipPriceRule", item.id, "Create member pricing rule", { levelId: item.levelId });
    return ok(formatPriceRule(item));
  }

  async updatePriceRule(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const data = buildPriceRuleUpdateData(body);
    if (data.levelId) await this.requireLevel(data.levelId as string);
    const item = await this.prisma.membershipPriceRule.update({
      where: { id },
      data,
      include: { level: true }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MembershipPriceRule", id, "Update member pricing rule", { levelId: item.levelId, enabled: item.enabled });
    return ok(formatPriceRule(item));
  }

  async listUsers(query: Record<string, unknown>) {
    const page = readOptionalPositiveInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalPositiveInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { nickname: { contains: keyword, mode: "insensitive" } },
            { wechatNickname: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } },
            { openid: { contains: keyword, mode: "insensitive" } }
          ]
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { memberships: { include: { level: true }, orderBy: { createdAt: "desc" }, take: 3 } }
      }),
      this.prisma.user.count({ where })
    ]);
    return ok({ items: items.map(formatUser), total, page, pageSize });
  }

  private async requireLevel(levelId: string) {
    const level = await this.prisma.memberLevel.findUnique({ where: { id: levelId } });
    if (!level) throw new NotFoundException("Member level not found");
    return level;
  }

  private async requireEnabledLevel(levelId: string) {
    const level = await this.requireLevel(levelId);
    if (!level.enabled) throw new ConflictException("Member level is disabled and cannot be granted");
    return level;
  }

  private async grantAutoBenefits(
    tx: Prisma.TransactionClient,
    membershipId: string,
    userId: string,
    levelId: string,
    expiredAt: Date | null,
    source: string,
    remark: string | null
  ) {
    const benefits = await tx.memberBenefit.findMany({ where: { levelId, enabled: true, autoGrant: true } });
    for (const benefit of benefits) {
      await tx.memberBenefitGrant.upsert({
        where: { userId_benefitId_membershipId: { userId, benefitId: benefit.id, membershipId } },
        create: {
          userId,
          membershipId,
          benefitId: benefit.id,
          status: "GRANTED",
          source,
          expiredAt,
          remark,
          metadataJson: { levelId, benefitType: benefit.type }
        },
        update: {
          status: "GRANTED",
          source,
          expiredAt,
          remark,
          metadataJson: { levelId, benefitType: benefit.type, idempotent: true }
        }
      });
    }
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatLevel(level: Prisma.MemberLevelGetPayload<{ include: { benefits: true; _count: { select: { benefits: true; memberships: true; priceRules: true } } } }>) {
  return {
    ...level,
    createdAt: level.createdAt.toISOString(),
    updatedAt: level.updatedAt.toISOString(),
    benefitCount: level._count.benefits,
    memberCount: level._count.memberships,
    priceRuleCount: level._count.priceRules,
    benefits: level.benefits.map(formatBenefitLite)
  };
}

function formatMembership(item: Prisma.UserMembershipGetPayload<{ include: { user: true; level: true; benefitGrants: { include: { benefit: true } } } }>) {
  return {
    ...item,
    effectiveStatus: effectiveMembershipStatus(item.status, item.endsAt),
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    renewedAt: item.renewedAt?.toISOString() ?? null,
    disabledAt: item.disabledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: formatUserBase(item.user),
    level: formatLevelBase(item.level),
    benefitGrants: item.benefitGrants.map((grant) => ({
      id: grant.id,
      status: grant.status,
      source: grant.source,
      grantedAt: grant.grantedAt.toISOString(),
      expiredAt: grant.expiredAt?.toISOString() ?? null,
      benefit: formatBenefitLite(grant.benefit)
    }))
  };
}

function formatBenefit(item: Prisma.MemberBenefitGetPayload<{ include: { level: true; _count: { select: { grants: true } } } }>) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    grantCount: item._count.grants,
    level: formatLevelBase(item.level)
  };
}

function formatBenefitLite(benefit: { id: string; levelId: string; title: string; description: string | null; type: string; iconUrl: string | null; autoGrant: boolean; visible: boolean; grantRule: string | null; enabled: boolean; sortOrder: number }) {
  return {
    id: benefit.id,
    levelId: benefit.levelId,
    title: benefit.title,
    description: benefit.description,
    type: benefit.type,
    iconUrl: benefit.iconUrl,
    autoGrant: benefit.autoGrant,
    visible: benefit.visible,
    grantRule: benefit.grantRule,
    enabled: benefit.enabled,
    sortOrder: benefit.sortOrder
  };
}

function formatBenefitGrant(item: Prisma.MemberBenefitGrantGetPayload<{ include: { user: true; benefit: { include: { level: true } }; membership: { include: { level: true } } } }>) {
  return {
    ...item,
    grantedAt: item.grantedAt.toISOString(),
    usedAt: item.usedAt?.toISOString() ?? null,
    expiredAt: item.expiredAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: formatUserBase(item.user),
    benefit: { ...formatBenefitLite(item.benefit), level: formatLevelBase(item.benefit.level) },
    membership: item.membership
      ? {
          id: item.membership.id,
          status: item.membership.status,
          effectiveStatus: effectiveMembershipStatus(item.membership.status, item.membership.endsAt),
          startsAt: item.membership.startsAt.toISOString(),
          endsAt: item.membership.endsAt?.toISOString() ?? null,
          level: formatLevelBase(item.membership.level)
        }
      : null
  };
}

function formatPriceRule(item: Prisma.MembershipPriceRuleGetPayload<{ include: { level: true } }>) {
  return {
    ...item,
    startAt: item.startAt?.toISOString() ?? null,
    endAt: item.endAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    level: formatLevelBase(item.level),
    priorityText: "同一票种命中多条规则时，优先优惠金额更大，其次精确票种优先，再次精确会议优先。"
  };
}

function formatUser(user: Prisma.UserGetPayload<{ include: { memberships: { include: { level: true } } } }>) {
  return {
    ...formatUserBase(user),
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      status: membership.status,
      effectiveStatus: effectiveMembershipStatus(membership.status, membership.endsAt),
      startsAt: membership.startsAt.toISOString(),
      endsAt: membership.endsAt?.toISOString() ?? null,
      level: formatLevelBase(membership.level)
    }))
  };
}

function formatUserBase(user: { id: string; openid: string | null; nickname: string | null; wechatNickname: string | null; wechatAvatarUrl: string | null; phone: string | null; createdAt: Date; lastActiveAt: Date | null }) {
  return {
    id: user.id,
    openid: maskOpenid(user.openid),
    nickname: user.nickname,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
    phone: maskPhone(user.phone),
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null
  };
}

function formatLevelBase(level: { id: string; code: string; name: string; enabled: boolean; pricingEnabled: boolean; defaultDays: number | null; rank: number }) {
  return {
    id: level.id,
    code: level.code,
    name: level.name,
    enabled: level.enabled,
    pricingEnabled: level.pricingEnabled,
    defaultDays: level.defaultDays,
    rank: level.rank
  };
}

function effectiveMembershipStatus(status: string, endsAt: Date | null) {
  if (status === "ACTIVE" && endsAt && endsAt.getTime() < Date.now()) return "EXPIRED";
  return status;
}

function buildBenefitData(body: Record<string, unknown>, levelId: string): Prisma.MemberBenefitUncheckedCreateInput {
  return {
    levelId,
    title: readRequiredString(body, "title"),
    description: readNullableString(body.description),
    type: readEnum(body, "type", BENEFIT_TYPES) ?? "TEXT",
    iconUrl: readNullableString(body.iconUrl),
    autoGrant: readOptionalBoolean(body, "autoGrant") ?? false,
    visible: readOptionalBoolean(body, "visible") ?? true,
    grantRule: readNullableString(body.grantRule),
    configJson: readNullableObject(body.configJson),
    enabled: readOptionalBoolean(body, "enabled") ?? true,
    sortOrder: readOptionalInt(body, "sortOrder") ?? 0
  };
}

function buildBenefitUpdateData(body: Record<string, unknown>): Prisma.MemberBenefitUncheckedUpdateInput {
  return {
    ...(typeof body.levelId !== "undefined" ? { levelId: readRequiredString(body, "levelId") } : {}),
    ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
    ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
    ...(typeof body.type !== "undefined" ? { type: readRequiredEnum(body, "type", BENEFIT_TYPES) } : {}),
    ...(typeof body.iconUrl !== "undefined" ? { iconUrl: readNullableString(body.iconUrl) } : {}),
    ...(typeof body.autoGrant !== "undefined" ? { autoGrant: readRequiredBoolean(body.autoGrant, "autoGrant") } : {}),
    ...(typeof body.visible !== "undefined" ? { visible: readRequiredBoolean(body.visible, "visible") } : {}),
    ...(typeof body.grantRule !== "undefined" ? { grantRule: readNullableString(body.grantRule) } : {}),
    ...(typeof body.configJson !== "undefined" ? { configJson: readNullableObject(body.configJson) } : {}),
    ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
    ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readRequiredInt(body, "sortOrder") } : {})
  };
}

function buildPriceRuleData(body: Record<string, unknown>, levelId: string): Prisma.MembershipPriceRuleUncheckedCreateInput {
  return validatePriceRuleAmounts({
    levelId,
    conferenceId: readNullableString(body.conferenceId),
    skuId: readNullableString(body.skuId),
    fixedPriceCent: readOptionalNonNegativeInt(body, "fixedPriceCent"),
    discountPercent: readOptionalPercent(body, "discountPercent"),
    discountCent: readOptionalNonNegativeInt(body, "discountCent"),
    enabled: readOptionalBoolean(body, "enabled") ?? true,
    startAt: readOptionalDate(body, "startAt"),
    endAt: readOptionalDate(body, "endAt")
  });
}

function buildPriceRuleUpdateData(body: Record<string, unknown>): Prisma.MembershipPriceRuleUncheckedUpdateInput {
  return validatePriceRuleAmounts({
    ...(typeof body.levelId !== "undefined" ? { levelId: readRequiredString(body, "levelId") } : {}),
    ...(typeof body.conferenceId !== "undefined" ? { conferenceId: readNullableString(body.conferenceId) } : {}),
    ...(typeof body.skuId !== "undefined" ? { skuId: readNullableString(body.skuId) } : {}),
    ...(typeof body.fixedPriceCent !== "undefined" ? { fixedPriceCent: readOptionalNonNegativeInt(body, "fixedPriceCent") } : {}),
    ...(typeof body.discountPercent !== "undefined" ? { discountPercent: readOptionalPercent(body, "discountPercent") } : {}),
    ...(typeof body.discountCent !== "undefined" ? { discountCent: readOptionalNonNegativeInt(body, "discountCent") } : {}),
    ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
    ...(typeof body.startAt !== "undefined" ? { startAt: readOptionalDate(body, "startAt") ?? null } : {}),
    ...(typeof body.endAt !== "undefined" ? { endAt: readOptionalDate(body, "endAt") ?? null } : {})
  });
}

function validatePriceRuleAmounts<T extends { fixedPriceCent?: number | null; discountPercent?: number | null; discountCent?: number | null; startAt?: Date | null; endAt?: Date | null }>(input: T): T {
  const hasAmount = typeof input.fixedPriceCent === "number" || typeof input.discountPercent === "number" || typeof input.discountCent === "number";
  if (!hasAmount) throw new BadRequestException("会员价规则至少需要固定价、折扣或立减中的一项");
  if (input.startAt && input.endAt && input.endAt <= input.startAt) throw new BadRequestException("失效时间必须晚于生效时间");
  return input;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求体格式不正确");
  return value as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readCode(body: Record<string, unknown>, key: string) {
  const value = readRequiredString(body, key);
  if (!/^[a-zA-Z0-9_-]{2,40}$/.test(value)) throw new BadRequestException(`${key} 只能包含字母、数字、下划线和短横线`);
  return value;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readEnum(body: Record<string, unknown>, key: string, allowed: Set<string>): string | undefined {
  const value = readOptionalString(body, key);
  if (!value) return undefined;
  if (!allowed.has(value)) throw new BadRequestException(`${key} 不支持`);
  return value;
}

function readRequiredEnum(body: Record<string, unknown>, key: string, allowed: Set<string>): string {
  const value = readRequiredString(body, key);
  if (!allowed.has(value)) throw new BadRequestException(`${key} 不支持`);
  return value;
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredInt(body: Record<string, unknown>, key: string): number {
  const value = readOptionalInt(body, key);
  if (typeof value !== "number") throw new BadRequestException(`${key} 必须是整数`);
  return value;
}

function readOptionalPositiveInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = readOptionalInt(body, key);
  if (typeof value === "undefined") return undefined;
  if (value <= 0) throw new BadRequestException(`${key} 必须大于 0`);
  return value;
}

function readOptionalNonNegativeInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = readOptionalInt(body, key);
  if (typeof value === "undefined") return undefined;
  if (value < 0) throw new BadRequestException(`${key} 不能小于 0`);
  return value;
}

function readRequiredNonNegativeInt(body: Record<string, unknown>, key: string): number {
  const value = readOptionalNonNegativeInt(body, key);
  if (typeof value !== "number") throw new BadRequestException(`${key} 必须是非负整数`);
  return value;
}

function readOptionalPercent(body: Record<string, unknown>, key: string): number | null {
  const value = readOptionalInt(body, key);
  if (typeof value === "undefined" || value === 0) return null;
  if (value < 0 || value > 10000) throw new BadRequestException(`${key} 必须在 0 到 10000 之间`);
  return value;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

function readRequiredBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${key} 必须是布尔值`);
  return value;
}

function readOptionalDate(body: Record<string, unknown>, key: string): Date | undefined {
  const value = body[key];
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${key} 日期格式不正确`);
  return date;
}

function readNullableObject(value: unknown): Prisma.InputJsonObject | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("JSON 字段必须是对象");
  return value as Prisma.InputJsonObject;
}

function resolveMembershipEndAt(startsAt: Date, explicitEndsAt: Date | undefined, durationDays: number | undefined) {
  if (explicitEndsAt && explicitEndsAt <= startsAt) throw new BadRequestException("到期时间必须晚于开始时间");
  if (explicitEndsAt) return explicitEndsAt;
  return durationDays ? addDays(startsAt, durationDays) : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function maskPhone(value: string | null) {
  if (!value || value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function maskOpenid(value: string | null) {
  if (!value || value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
