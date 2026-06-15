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
      include: { benefits: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    });
    return ok({ items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), benefits: item.benefits.map((benefit) => ({ ...benefit, createdAt: benefit.createdAt.toISOString(), updatedAt: benefit.updatedAt.toISOString() })) })) });
  }

  async mine(currentUser: CurrentUser | undefined) {
    if (!currentUser) {
      return ok({ membership: null });
    }
    const membership = await this.prisma.userMembership.findFirst({
      where: { userId: currentUser.id, status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      orderBy: [{ createdAt: "desc" }],
      include: { level: { include: { benefits: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } } }
    });
    return ok({
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            startsAt: membership.startsAt.toISOString(),
            endsAt: membership.endsAt?.toISOString() ?? null,
            level: {
              id: membership.level.id,
              code: membership.level.code,
              name: membership.level.name,
              description: membership.level.description,
              discountPercent: membership.level.discountPercent,
              benefits: membership.level.benefits.map((benefit) => ({
                id: benefit.id,
                title: benefit.title,
                description: benefit.description,
                type: benefit.type
              }))
            }
          }
        : null
    });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}
