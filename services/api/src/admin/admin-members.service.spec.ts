import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConflictException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { MemberService } from "../member/member.service";
import { AdminMembersService } from "./admin-members.service";
import { CurrentAdmin } from "./current-admin";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };

describe("AdminMembersService production workflows", () => {
  it("creates member levels and writes audit logs", async () => {
    const prisma = createMemberPrismaMock();
    const service = new AdminMembersService(prisma);

    const created = await service.createLevel({ code: "silver", name: "银牌会员", defaultDays: 180, pricingEnabled: true }, admin);

    assert.equal(created.data.code, "silver");
    assert.equal(created.data.defaultDays, 180);
    assert.equal(prisma.auditLogs.some((item: any) => item.entityType === "MemberLevel" && item.action === AuditAction.CREATE), true);
  });

  it("rejects granting disabled member levels", async () => {
    const prisma = createMemberPrismaMock({ disabledGold: true });
    const service = new AdminMembersService(prisma);

    await assert.rejects(() => service.grantMembership({ userId: "user-1", levelId: "level-gold" }, admin), ConflictException);
  });

  it("grants, renews, disables, and changes memberships with automatic benefit grants", async () => {
    const prisma = createMemberPrismaMock();
    const service = new AdminMembersService(prisma);

    const granted = await service.grantMembership({ userId: "user-1", levelId: "level-gold", durationDays: 30, source: "ADMIN_GRANT" }, admin);
    assert.equal(granted.data.status, "ACTIVE");
    assert.equal(prisma.benefitGrants.length, 1);
    assert.equal(prisma.benefitGrants[0]?.status, "GRANTED");

    await service.renewMembership(granted.data.id, { durationDays: 30 }, admin);
    assert.equal(prisma.benefitGrants.length, 1);
    assert.equal(prisma.benefitGrants[0]?.source, "RENEWAL");

    await service.changeMembershipLevel(granted.data.id, { levelId: "level-vip" }, admin);
    assert.equal(prisma.memberships[0]?.levelId, "level-vip");
    assert.equal(prisma.benefitGrants.length, 2);

    const disabled = await service.disableMembership(granted.data.id, { reason: "用户不再符合条件" }, admin);
    assert.equal(disabled.data.status, "DISABLED");
    assert.equal(prisma.benefitGrants.every((item: any) => item.status === "REVOKED"), true);
    assert.equal(prisma.auditLogs.filter((item: any) => item.entityType === "UserMembership").length >= 4, true);
  });

  it("updates benefit and pricing rules through persisted records", async () => {
    const prisma = createMemberPrismaMock();
    const service = new AdminMembersService(prisma);

    const benefit = await service.createBenefit({ levelId: "level-gold", title: "专属客服", type: "SERVICE", autoGrant: true, visible: true }, admin);
    await service.updateBenefit(benefit.data.id, { title: "专属会务客服", enabled: false }, admin);
    const rule = await service.createPriceRule({ levelId: "level-gold", fixedPriceCent: 9000, enabled: true }, admin);
    await service.updatePriceRule(rule.data.id, { fixedPriceCent: 8000, enabled: false }, admin);

    assert.equal(prisma.benefits.some((item: any) => item.title === "专属会务客服" && item.enabled === false), true);
    assert.equal(prisma.priceRules.some((item: any) => item.fixedPriceCent === 8000 && item.enabled === false), true);
  });
});

describe("MemberService user member center", () => {
  it("returns only current user's membership benefit grants", async () => {
    const prisma = createMemberPrismaMock();
    const adminService = new AdminMembersService(prisma);
    await adminService.grantMembership({ userId: "user-1", levelId: "level-gold", durationDays: 30 }, admin);
    await adminService.grantMembership({ userId: "user-2", levelId: "level-gold", durationDays: 30 }, admin);
    const memberService = new MemberService(prisma);

    const center = await memberService.center({ id: "user-1", openid: "openid-1", nickname: "用户一" });

    assert.equal(center.data.membership?.level.name, "金牌会员");
    assert.equal(center.data.grants.length, 1);
    assert.equal(center.data.grants[0]?.benefit.title, "自动权益");
    assert.equal(center.data.purchase.enabled, false);
  });

  it("returns non-member status without fake membership data", async () => {
    const memberService = new MemberService(createMemberPrismaMock());

    const center = await memberService.center({ id: "user-new", openid: "openid-new", nickname: "新用户" });

    assert.equal(center.data.membership, null);
    assert.deepEqual(center.data.grants, []);
    assert.equal(center.data.levels.length >= 1, true);
  });
});

function createMemberPrismaMock(options: { disabledGold?: boolean } = {}) {
  const now = new Date("2026-06-18T10:00:00.000Z");
  const users = [
    userRecord("user-1", "openid-1", "用户一"),
    userRecord("user-2", "openid-2", "用户二")
  ];
  const levels: any[] = [
    { id: "level-gold", code: "gold", name: "金牌会员", description: "金牌权益", rank: 10, priceCent: 9900, discountPercent: 9000, defaultDays: 365, pricingEnabled: true, enabled: !options.disabledGold, benefitsJson: null, createdAt: now, updatedAt: now },
    { id: "level-vip", code: "vip", name: "VIP 会员", description: "VIP 权益", rank: 20, priceCent: 19900, discountPercent: 8500, defaultDays: 365, pricingEnabled: true, enabled: true, benefitsJson: null, createdAt: now, updatedAt: now }
  ];
  const benefits: any[] = [
    benefitRecord("benefit-auto", "level-gold", "自动权益", true),
    benefitRecord("benefit-vip", "level-vip", "VIP 权益", true),
    benefitRecord("benefit-display", "level-gold", "展示权益", false)
  ];
  const memberships: any[] = [];
  const benefitGrants: any[] = [];
  const priceRules: any[] = [];
  const auditLogs: any[] = [];
  const prisma: any = {
    users,
    levels,
    benefits,
    memberships,
    benefitGrants,
    priceRules,
    auditLogs,
    $transaction: async (input: any) => (Array.isArray(input) ? Promise.all(input) : input(prisma)),
    memberLevel: {
      findMany: async (args: any = {}) => levels.filter((item) => (typeof args.where?.enabled === "boolean" ? item.enabled === args.where.enabled : true)).map((item) => hydrateLevel(item)),
      findUnique: async ({ where, include }: any) => {
        const item = levels.find((level) => level.id === where.id);
        if (!item) return null;
        return include?._count ? { ...item, _count: { benefits: benefits.filter((benefit) => benefit.levelId === item.id).length, memberships: memberships.filter((membership) => membership.levelId === item.id).length, priceRules: priceRules.filter((rule) => rule.levelId === item.id).length } } : item;
      },
      create: async ({ data }: any) => {
        const item = { id: `level-${levels.length + 1}`, benefitsJson: null, createdAt: now, updatedAt: now, ...data };
        levels.push(item);
        return hydrateLevel(item);
      },
      update: async ({ where, data }: any) => hydrateLevel(Object.assign(levels.find((item) => item.id === where.id), data, { updatedAt: now }))
    },
    user: {
      findUnique: async ({ where }: any) => users.find((item) => item.id === where.id) ?? null,
      findMany: async () => users.map((user) => ({ ...user, memberships: memberships.filter((item) => item.userId === user.id).map((item) => ({ ...item, level: levels.find((level) => level.id === item.levelId) })) })),
      count: async () => users.length
    },
    userMembership: {
      create: async ({ data }: any) => {
        const item = { id: `membership-${memberships.length + 1}`, status: "ACTIVE", createdAt: now, updatedAt: now, renewedAt: null, disabledAt: null, disabledReason: null, ...data };
        memberships.push(item);
        return hydrateMembership(item);
      },
      findMany: async ({ where }: any = {}) => memberships.filter((item) => (where?.userId ? item.userId === where.userId : true)).map(hydrateMembership),
      findFirst: async ({ where }: any = {}) => {
        const item = memberships.find((membership) => {
          const level = levels.find((candidate) => candidate.id === membership.levelId);
          return (!where.userId || membership.userId === where.userId) && (!where.status || membership.status === where.status) && (!where.level?.enabled || level?.enabled) && (!membership.endsAt || membership.endsAt > now);
        });
        return item ? hydrateMembership(item) : null;
      },
      count: async () => memberships.length,
      findUnique: async ({ where }: any) => {
        const item = memberships.find((membership) => membership.id === where.id);
        return item ? hydrateMembership(item) : null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const item = memberships.find((membership) => membership.id === where.id);
        if (!item) throw new Error("membership not found");
        return hydrateMembership(item);
      },
      update: async ({ where, data }: any) => {
        const item = memberships.find((membership) => membership.id === where.id);
        if (!item) throw new Error("membership not found");
        Object.assign(item, data, { updatedAt: now });
        return hydrateMembership(item);
      }
    },
    memberBenefit: {
      findMany: async ({ where }: any = {}) =>
        benefits
          .filter((item) => (where?.levelId ? item.levelId === where.levelId : true))
          .filter((item) => (typeof where?.enabled === "boolean" ? item.enabled === where.enabled : true))
          .filter((item) => (typeof where?.autoGrant === "boolean" ? item.autoGrant === where.autoGrant : true))
          .map(hydrateBenefit),
      create: async ({ data }: any) => {
        const item = { id: `benefit-${benefits.length + 1}`, createdAt: now, updatedAt: now, ...data };
        benefits.push(item);
        return hydrateBenefit(item);
      },
      update: async ({ where, data }: any) => {
        const item = benefits.find((benefit) => benefit.id === where.id);
        if (!item) throw new Error("benefit not found");
        Object.assign(item, data, { updatedAt: now });
        return hydrateBenefit(item);
      }
    },
    memberBenefitGrant: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.userId_benefitId_membershipId;
        const existing = benefitGrants.find((item) => item.userId === key.userId && item.benefitId === key.benefitId && item.membershipId === key.membershipId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return hydrateGrant(existing);
        }
        const item = { id: `grant-${benefitGrants.length + 1}`, createdAt: now, updatedAt: now, usedAt: null, grantedAt: now, ...create };
        benefitGrants.push(item);
        return hydrateGrant(item);
      },
      updateMany: async ({ where, data }: any) => {
        const matched = benefitGrants.filter((item) => (!where.membershipId || item.membershipId === where.membershipId) && (!where.status || (Array.isArray(where.status.in) ? where.status.in.includes(item.status) : item.status === where.status)));
        matched.forEach((item) => Object.assign(item, data, { updatedAt: now }));
        return { count: matched.length };
      },
      findMany: async ({ where }: any = {}) =>
        benefitGrants
          .filter((item) => (where?.userId ? item.userId === where.userId : true))
          .filter((item) => (where?.status ? item.status === where.status : true))
          .map(hydrateGrant),
      count: async () => benefitGrants.length,
      update: async ({ where, data }: any) => {
        const item = benefitGrants.find((grant) => grant.id === where.id);
        if (!item) throw new Error("grant not found");
        Object.assign(item, data, { updatedAt: now });
        return hydrateGrant(item);
      }
    },
    membershipPriceRule: {
      findMany: async () => priceRules.map(hydrateRule),
      create: async ({ data }: any) => {
        const item = { id: `rule-${priceRules.length + 1}`, createdAt: now, updatedAt: now, ...data };
        priceRules.push(item);
        return hydrateRule(item);
      },
      update: async ({ where, data }: any) => {
        const item = priceRules.find((rule) => rule.id === where.id);
        if (!item) throw new Error("rule not found");
        Object.assign(item, data, { updatedAt: now });
        return hydrateRule(item);
      }
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }
    }
  };

  function hydrateLevel(item: any) {
    return { ...item, benefits: benefits.filter((benefit) => benefit.levelId === item.id).map(hydrateBenefitLite), _count: { benefits: benefits.filter((benefit) => benefit.levelId === item.id).length, memberships: memberships.filter((membership) => membership.levelId === item.id).length, priceRules: priceRules.filter((rule) => rule.levelId === item.id).length } };
  }
  function hydrateMembership(item: any) {
    return { ...item, user: users.find((user) => user.id === item.userId), level: hydrateLevel(levels.find((level) => level.id === item.levelId)), benefitGrants: benefitGrants.filter((grant) => grant.membershipId === item.id).map(hydrateGrantLite) };
  }
  function hydrateBenefit(item: any) {
    return { ...item, level: levels.find((level) => level.id === item.levelId), _count: { grants: benefitGrants.filter((grant) => grant.benefitId === item.id).length } };
  }
  function hydrateBenefitLite(item: any) {
    return { ...item };
  }
  function hydrateGrant(item: any) {
    return { ...item, user: users.find((user) => user.id === item.userId), benefit: { ...benefits.find((benefit) => benefit.id === item.benefitId), level: levels.find((level) => level.id === benefits.find((benefit) => benefit.id === item.benefitId)?.levelId) }, membership: item.membershipId ? hydrateMembership(memberships.find((membership) => membership.id === item.membershipId)) : null };
  }
  function hydrateGrantLite(item: any) {
    return { ...item, benefit: benefits.find((benefit) => benefit.id === item.benefitId) };
  }
  function hydrateRule(item: any) {
    return { ...item, level: levels.find((level) => level.id === item.levelId) };
  }

  return prisma as typeof prisma & PrismaService;
}

function userRecord(id: string, openid: string, nickname: string) {
  const now = new Date("2026-06-18T10:00:00.000Z");
  return { id, openid, unionid: null, nickname, wechatNickname: nickname, wechatAvatarUrl: null, profileUpdatedAt: null, lastActiveAt: now, phone: id === "user-1" ? "13800000000" : null, createdAt: now, updatedAt: now };
}

function benefitRecord(id: string, levelId: string, title: string, autoGrant: boolean) {
  const now = new Date("2026-06-18T10:00:00.000Z");
  return { id, levelId, title, description: `${title}说明`, type: "TEXT", iconUrl: null, autoGrant, visible: true, grantRule: autoGrant ? "授予即发放" : "展示型权益", configJson: null, enabled: true, sortOrder: 0, createdAt: now, updatedAt: now };
}
