import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export function activityPage(query: Record<string, unknown>) {
  const integer = (value: unknown, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
  };
  const page = integer(query.page, 1, 100000);
  const pageSize = integer(query.pageSize, 20, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

@Injectable()
export class AdminUserActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string, query: Record<string, unknown>, includeRegistrations = true) {
    const { page, pageSize, skip } = activityPage(query);
    const user = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, realName: true, nickname: true, wechatNickname: true,
        wechatAvatarUrl: true, phone: true, phoneVerifiedAt: true, createdAt: true, lastActiveAt: true }
    });
    if (!user) throw new NotFoundException("用户不存在");
    const account = { ...user, phone: user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : null,
      phoneVerified: Boolean(user.phoneVerifiedAt), phoneVerifiedAt: undefined };
    if (!includeRegistrations) return { code: "OK", message: "ok", data: {
      user: account, registrations: { items: [], total: 0, page, pageSize }, orderCount: 0, paidOrderCount: 0
    } };
    // An account's submitted registrations are not proof that the account holder attended.
    const where = { OR: [{ userId: id }, { attendees: { some: { guestProfile: { userId: id } } } }, { order: { businessOwnerUserId: id } }] };
    const [items, total, orderCount, paidOrderCount] = await this.prisma.$transaction([
      this.prisma.registration.findMany({ where, skip, take: pageSize, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, registrationNo: true, userId: true, status: true, source: true, createdAt: true,
          attendeeName: true, phone: true, paidAmountCent: true,
          conference: { select: { id: true, title: true, startsAt: true } },
          sku: { select: { name: true } },
          order: { select: { orderNo: true, status: true, paidAt: true,
            refunds: { select: { status: true, amountCent: true } } } },
          attendees: { select: { id: true, name: true, phone: true, checkInStatus: true, guestProfile: { select: { userId: true } } } }
        }
      }),
      this.prisma.registration.count({ where }),
      this.prisma.order.count({ where: { userId: id } }),
      this.prisma.order.count({ where: { userId: id, paidAt: { not: null } } })
    ]);
    return { code: "OK", message: "ok", data: {
      user: account,
      registrations: { items: items.map(item => ({ ...item,
        relationship: item.userId === id ? "SUBMITTED" : item.attendees.some(a => a.guestProfile?.userId === id) ? "ATTENDEE" : "BUSINESS_CONTACT",
        refundedAmountCent: item.order.refunds.filter(r => r.status === "SUCCESS").reduce((sum, r) => sum + r.amountCent, 0)
      })), total, page, pageSize }, orderCount, paidOrderCount
    } };
  }
}
