import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async listLevels() {
    const items = await this.prisma.memberLevel.findMany({
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      include: { benefits: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    });
    return ok({ items: items.map(formatLevel) });
  }

  async createLevel(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const level = await this.prisma.memberLevel.create({
      data: {
        code: readRequiredString(body, "code"),
        name: readRequiredString(body, "name"),
        description: readNullableString(body.description),
        rank: readOptionalInt(body, "rank") ?? 0,
        priceCent: readOptionalInt(body, "priceCent") ?? 0,
        discountPercent: readOptionalInt(body, "discountPercent"),
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        benefitsJson: readNullableObject(body.benefitsJson)
      },
      include: { benefits: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MemberLevel", level.id, "Create member level", { code: level.code });
    return ok(formatLevel(level));
  }

  async updateLevel(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const level = await this.prisma.memberLevel.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
        ...(typeof body.rank !== "undefined" ? { rank: readRequiredInt(body, "rank") } : {}),
        ...(typeof body.priceCent !== "undefined" ? { priceCent: readRequiredInt(body, "priceCent") } : {}),
        ...(typeof body.discountPercent !== "undefined" ? { discountPercent: readOptionalInt(body, "discountPercent") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.benefitsJson !== "undefined" ? { benefitsJson: readNullableObject(body.benefitsJson) } : {})
      },
      include: { benefits: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MemberLevel", id, "Update member level", { code: level.code });
    return ok(formatLevel(level));
  }

  async listMemberships(query: Record<string, unknown>) {
    const page = readOptionalInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const status = readOptionalString(query, "status");
    const where: Prisma.UserMembershipWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { user: { nickname: { contains: keyword, mode: "insensitive" } } },
              { user: { wechatNickname: { contains: keyword, mode: "insensitive" } } },
              { user: { phone: { contains: keyword, mode: "insensitive" } } },
              { level: { name: { contains: keyword, mode: "insensitive" } } }
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
        include: { user: true, level: true }
      }),
      this.prisma.userMembership.count({ where })
    ]);
    return ok({ items: items.map(formatMembership), total, page, pageSize });
  }

  async assignMembership(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const userId = readRequiredString(body, "userId");
    const levelId = readRequiredString(body, "levelId");
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");
    const membership = await this.prisma.userMembership.create({
      data: {
        userId,
        levelId,
        status: readOptionalString(body, "status") ?? "ACTIVE",
        startsAt: readOptionalDate(body, "startsAt") ?? new Date(),
        endsAt: readOptionalDate(body, "endsAt"),
        source: readOptionalString(body, "source") ?? "ADMIN",
        remark: readNullableString(body.remark)
      },
      include: { user: true, level: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "UserMembership", membership.id, "Assign membership", { userId, levelId });
    return ok(formatMembership(membership));
  }

  async listBenefits(query: Record<string, unknown>) {
    const levelId = readOptionalString(query, "levelId");
    const items = await this.prisma.memberBenefit.findMany({
      where: { ...(levelId ? { levelId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { level: true }
    });
    return ok({ items: items.map(formatBenefit) });
  }

  async createBenefit(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.memberBenefit.create({
      data: {
        levelId: readRequiredString(body, "levelId"),
        title: readRequiredString(body, "title"),
        description: readNullableString(body.description),
        type: readOptionalString(body, "type") ?? "TEXT",
        configJson: readNullableObject(body.configJson),
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        sortOrder: readOptionalInt(body, "sortOrder") ?? 0
      },
      include: { level: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MemberBenefit", item.id, "Create member benefit", { levelId: item.levelId });
    return ok(formatBenefit(item));
  }

  async listPriceRules(query: Record<string, unknown>) {
    const levelId = readOptionalString(query, "levelId");
    const items = await this.prisma.membershipPriceRule.findMany({
      where: { ...(levelId ? { levelId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { level: true }
    });
    return ok({ items: items.map(formatPriceRule) });
  }

  async createPriceRule(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.membershipPriceRule.create({
      data: {
        levelId: readRequiredString(body, "levelId"),
        conferenceId: readNullableString(body.conferenceId),
        skuId: readNullableString(body.skuId),
        discountPercent: readOptionalInt(body, "discountPercent"),
        discountCent: readOptionalInt(body, "discountCent"),
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        startAt: readOptionalDate(body, "startAt"),
        endAt: readOptionalDate(body, "endAt")
      },
      include: { level: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MembershipPriceRule", item.id, "Create member pricing rule", { levelId: item.levelId });
    return ok(formatPriceRule(item));
  }

  async listUsers(query: Record<string, unknown>) {
    const page = readOptionalInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalInt(query, "pageSize") ?? 20, 100);
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
        include: { memberships: { include: { level: true }, orderBy: { createdAt: "desc" }, take: 1 } }
      }),
      this.prisma.user.count({ where })
    ]);
    return ok({ items: items.map(formatUser), total, page, pageSize });
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatLevel(level: Prisma.MemberLevelGetPayload<{ include: { benefits: true } }>) {
  return {
    ...level,
    createdAt: level.createdAt.toISOString(),
    updatedAt: level.updatedAt.toISOString(),
    benefits: level.benefits.map((benefit) => ({ ...benefit, createdAt: benefit.createdAt.toISOString(), updatedAt: benefit.updatedAt.toISOString() }))
  };
}

function formatMembership(item: Prisma.UserMembershipGetPayload<{ include: { user: true; level: true } }>) {
  return {
    ...item,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: formatUserBase(item.user),
    level: { id: item.level.id, code: item.level.code, name: item.level.name }
  };
}

function formatBenefit(item: Prisma.MemberBenefitGetPayload<{ include: { level: true } }>) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    level: { id: item.level.id, code: item.level.code, name: item.level.name }
  };
}

function formatPriceRule(item: Prisma.MembershipPriceRuleGetPayload<{ include: { level: true } }>) {
  return {
    ...item,
    startAt: item.startAt?.toISOString() ?? null,
    endAt: item.endAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    level: { id: item.level.id, code: item.level.code, name: item.level.name }
  };
}

function formatUser(user: Prisma.UserGetPayload<{ include: { memberships: { include: { level: true } } } }>) {
  return {
    ...formatUserBase(user),
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      status: membership.status,
      startsAt: membership.startsAt.toISOString(),
      endsAt: membership.endsAt?.toISOString() ?? null,
      level: { id: membership.level.id, code: membership.level.code, name: membership.level.name }
    }))
  };
}

function formatUserBase(user: { id: string; openid: string | null; nickname: string | null; wechatNickname: string | null; wechatAvatarUrl: string | null; phone: string | null; createdAt: Date; lastActiveAt: Date | null }) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null
  };
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

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredInt(body: Record<string, unknown>, key: string): number {
  const value = readOptionalInt(body, key);
  if (typeof value !== "number") throw new BadRequestException(`${key} 必须是整数`);
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
