import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { OrderStatus, PaymentStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { createCheckinCredentialPayload } from "../checkin/checkin-credential";
import { PrismaService } from "../prisma.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface MyRegistrationItem {
  id: string;
  registrationNo: string;
  status: RegistrationStatus;
  attendeeName: string;
  phone: string;
  paidAmountCent: number;
  confirmedAt: string;
  createdAt: string;
  conference: {
    id: string;
    title: string;
    slug: string;
    startsAt: string;
    endsAt: string;
  };
  sku: {
    id: string;
    name: string;
  };
  order: {
    orderNo: string;
  };
}

export interface MyRegistrationsResponse {
  items: MyRegistrationItem[];
}

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(currentUser: CurrentUser | undefined): Promise<ApiResponse<MyRegistrationsResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        userId: currentUser.id
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        registrationNo: true,
        status: true,
        attendeeName: true,
        phone: true,
        paidAmountCent: true,
        confirmedAt: true,
        createdAt: true,
        conference: {
          select: {
            id: true,
            title: true,
            slug: true,
            startsAt: true,
            endsAt: true
          }
        },
        sku: {
          select: {
            id: true,
            name: true
          }
        },
        order: {
          select: {
            orderNo: true
          }
        }
      }
    });

    return ok({
      items: registrations.map((registration) => ({
        id: registration.id,
        registrationNo: registration.registrationNo,
        status: registration.status,
        attendeeName: registration.attendeeName,
        phone: registration.phone,
        paidAmountCent: registration.paidAmountCent,
        confirmedAt: registration.confirmedAt.toISOString(),
        createdAt: registration.createdAt.toISOString(),
        conference: {
          id: registration.conference.id,
          title: registration.conference.title,
          slug: registration.conference.slug,
          startsAt: registration.conference.startsAt.toISOString(),
          endsAt: registration.conference.endsAt.toISOString()
        },
        sku: registration.sku,
        order: registration.order
      }))
    });
  }

  async getCredentialByRegistrationId(registrationId: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    const registration = await this.prisma.registration.findFirst({
      where: {
        id: registrationId,
        userId: currentUser.id,
        order: { status: OrderStatus.PAID }
      },
      select: credentialRegistrationSelect
    });

    if (!registration) {
      throw new NotFoundException("Registration credential not found");
    }

    return ok(formatCredential(registration));
  }

  async getCredentialByOrderNo(orderNo: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    const registration = await this.prisma.registration.findFirst({
      where: {
        userId: currentUser.id,
        order: {
          orderNo,
          status: OrderStatus.PAID
        }
      },
      select: credentialRegistrationSelect
    });

    if (!registration) {
      throw new NotFoundException("Registration credential not found");
    }

    return ok(formatCredential(registration));
  }
}

const credentialRegistrationSelect = {
  id: true,
  registrationNo: true,
  attendeeName: true,
  phone: true,
  formDataJson: true,
  paidAmountCent: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  conference: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      location: true,
      page: {
        select: {
          contentJson: true
        }
      }
    }
  },
  sku: {
    select: {
      id: true,
      name: true,
      priceCent: true
    }
  },
  order: {
    select: {
      orderNo: true,
      status: true,
      paidAt: true,
      paidAmountCent: true,
      payableAmountCent: true,
      payments: {
        where: { status: PaymentStatus.SUCCESS },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          provider: true,
          status: true,
          paidAt: true,
          amountCent: true
        }
      }
    }
  },
  attendees: {
    orderBy: [{ createdAt: "asc" }],
    take: 1,
    select: {
      name: true,
      phone: true,
      company: true,
      title: true,
      formDataJson: true,
      checkInStatus: true,
      checkedInAt: true
    }
  }
} satisfies Prisma.RegistrationSelect;

function formatCredential(registration: Prisma.RegistrationGetPayload<{ select: typeof credentialRegistrationSelect }>) {
  const attendee = registration.attendees[0];
  const formData = readObject(registration.formDataJson);
  const attendeeFormData = readObject(attendee?.formDataJson);
  const mergedFormData = { ...formData, ...attendeeFormData };
  const links = readCredentialLinks(registration.conference.page?.contentJson);
  const paidAt = registration.order.paidAt ?? registration.order.payments[0]?.paidAt ?? registration.confirmedAt;

  return {
    registrationId: registration.id,
    registrationNo: registration.registrationNo,
    credentialCode: registration.registrationNo,
    qrPayload: createCheckinCredentialPayload(registration.id, registration.registrationNo),
    status: registration.status,
    checkIn: {
      status: attendee?.checkInStatus ?? "NOT_REQUIRED",
      checkedInAt: attendee?.checkedInAt?.toISOString() ?? null
    },
    conference: {
      id: registration.conference.id,
      name: registration.conference.title,
      startTime: registration.conference.startsAt.toISOString(),
      endTime: registration.conference.endsAt.toISOString(),
      venue: registration.conference.location,
      address: readString(mergedFormData, ["address", "venueAddress"])
    },
    attendee: {
      name: attendee?.name ?? registration.attendeeName,
      mobileMasked: maskMobile(attendee?.phone ?? registration.phone),
      company: attendee?.company ?? readString(mergedFormData, ["company", "单位", "公司"]),
      title: attendee?.title ?? readString(mergedFormData, ["title", "position", "职位"])
    },
    ticket: {
      id: registration.sku.id,
      name: registration.sku.name,
      priceCent: registration.sku.priceCent
    },
    payment: {
      paidAmountCent: registration.order.paidAmountCent ?? registration.paidAmountCent,
      paidAt: paidAt?.toISOString() ?? null,
      status: registration.order.payments[0]?.status ?? registration.order.status
    },
    order: {
      orderNo: registration.order.orderNo
    },
    formSummary: summarizeFormData(mergedFormData),
    links
  };
}

function maskMobile(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

function summarizeFormData(input: Record<string, unknown>) {
  return Object.entries(input)
    .filter(([, value]) => typeof value === "string" || Array.isArray(value))
    .slice(0, 12)
    .map(([key, value]) => ({
      label: key,
      value: Array.isArray(value) ? value.join("、") : String(value)
    }));
}

function readCredentialLinks(value: Prisma.JsonValue | null | undefined) {
  const source = readObject(value);
  return {
    agendaUrl: readString(source, ["agendaUrl", "agendaLink"]),
    guideUrl: readString(source, ["guideUrl", "guideLink"]),
    groupJoinUrl: readString(source, ["groupJoinUrl", "customerGroupUrl", "wechatGroupUrl"]),
    contactUrl: readString(source, ["contactUrl", "serviceUrl"])
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}
