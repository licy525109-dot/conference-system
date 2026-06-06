import { Injectable, UnauthorizedException } from "@nestjs/common";
import { RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
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
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}
