import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CurrentUser } from "../auth/current-user";

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async levels() {
    const items = await this.prisma.memberLevel.findMany({
      where: { enabled: true },
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      include: { benefits: { where: { enabled: true, visible: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    });
    return ok({ items: items.map(formatLevel) });
  }

  async center(currentUser: CurrentUser | undefined) {
    const [levels, mine] = await Promise.all([this.levels(), this.mine(currentUser)]);
    return ok({
      levels: levels.data.items,
      membership: mine.data.membership,
      grants: mine.data.grants,
      purchase: {
        enabled: false,
        message: "会员购买支付暂未开放，可联系会务组或等待后台授予。"
      }
    });
  }

  async mine(currentUser: CurrentUser | undefined) {
    if (!currentUser) {
      return ok({ membership: null, grants: [] });
    }
    const membership = await this.prisma.userMembership.findFirst({
      where: { userId: currentUser.id, status: "ACTIVE", startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], level: { enabled: true } },
      orderBy: [{ createdAt: "desc" }],
      include: {
        level: { include: { benefits: { where: { enabled: true, visible: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } },
        benefitGrants: { include: { benefit: true }, orderBy: [{ grantedAt: "desc" }] }
      }
    });
    const grants = await this.prisma.memberBenefitGrant.findMany({
      where: { userId: currentUser.id, benefit: { enabled: true, visible: true } },
      orderBy: [{ grantedAt: "desc" }],
      include: { benefit: { include: { level: true } } }
    });
    return ok({
      membership: membership
        ? {
            id: membership.id,
            status: effectiveStatus(membership.status, membership.endsAt),
            startsAt: membership.startsAt.toISOString(),
            endsAt: membership.endsAt?.toISOString() ?? null,
            level: {
              id: membership.level.id,
              code: membership.level.code,
              name: membership.level.name,
              description: membership.level.description,
              discountPercent: membership.level.discountPercent,
              pricingEnabled: membership.level.pricingEnabled,
              benefits: membership.level.benefits.map(formatBenefit)
            }
          }
        : null,
      grants: grants.map(formatGrant)
    });
  }

  async benefits(currentUser: CurrentUser | undefined) {
    if (!currentUser) return ok({ items: [] });
    const grants = await this.prisma.memberBenefitGrant.findMany({
      where: { userId: currentUser.id, benefit: { enabled: true, visible: true } },
      orderBy: [{ grantedAt: "desc" }],
      include: { benefit: { include: { level: true } } }
    });
    return ok({ items: grants.map(formatGrant) });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatLevel(item: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rank: number;
  priceCent: number;
  discountPercent: number | null;
  defaultDays: number | null;
  pricingEnabled: boolean;
  benefits: Array<{ id: string; title: string; description: string | null; type: string; iconUrl: string | null; autoGrant: boolean; visible: boolean; grantRule: string | null }>;
}) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    rank: item.rank,
    priceCent: item.priceCent,
    discountPercent: item.discountPercent,
    defaultDays: item.defaultDays,
    pricingEnabled: item.pricingEnabled,
    benefits: item.benefits.map(formatBenefit)
  };
}

function formatBenefit(benefit: { id: string; title: string; description: string | null; type: string; iconUrl: string | null; autoGrant: boolean; visible: boolean; grantRule: string | null }) {
  return {
    id: benefit.id,
    title: benefit.title,
    description: benefit.description,
    type: benefit.type,
    iconUrl: benefit.iconUrl,
    autoGrant: benefit.autoGrant,
    visible: benefit.visible,
    grantRule: benefit.grantRule
  };
}

function formatGrant(item: {
  id: string;
  status: string;
  source: string;
  grantedAt: Date;
  usedAt: Date | null;
  expiredAt: Date | null;
  remark: string | null;
  benefit: { id: string; title: string; description: string | null; type: string; iconUrl: string | null; autoGrant: boolean; visible: boolean; grantRule: string | null; level: { id: string; code: string; name: string } };
}) {
  return {
    id: item.id,
    status: effectiveGrantStatus(item.status, item.expiredAt),
    source: item.source,
    grantedAt: item.grantedAt.toISOString(),
    usedAt: item.usedAt?.toISOString() ?? null,
    expiredAt: item.expiredAt?.toISOString() ?? null,
    remark: item.remark,
    benefit: { ...formatBenefit(item.benefit), level: item.benefit.level }
  };
}

function effectiveStatus(status: string, endsAt: Date | null) {
  if (status === "ACTIVE" && endsAt && endsAt.getTime() < Date.now()) return "EXPIRED";
  return status;
}

function effectiveGrantStatus(status: string, expiredAt: Date | null) {
  if (status === "GRANTED" && expiredAt && expiredAt.getTime() < Date.now()) return "EXPIRED";
  return status;
}
