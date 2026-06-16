import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>) {
    const pagination = parsePagination(query);
    const keyword = readOptionalString(query, "keyword");
    const action = readOptionalEnum(query, "action", AuditAction);
    const entityType = readOptionalString(query, "entityType");
    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(keyword
        ? {
            OR: [
              { entityType: { contains: keyword, mode: "insensitive" } },
              { entityId: { contains: keyword, mode: "insensitive" } },
              { summary: { contains: keyword, mode: "insensitive" } },
              { adminUser: { username: { contains: keyword, mode: "insensitive" } } },
              { adminUser: { displayName: { contains: keyword, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: {
          id: true,
          adminUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          metadataJson: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          adminUser: {
            select: {
              username: true,
              displayName: true
            }
          }
        }
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return ok({
      items: items.map((item) => ({
        id: item.id,
        adminId: item.adminUserId,
        adminName: item.adminUser?.displayName ?? item.adminUser?.username ?? "系统",
        action: item.action,
        targetType: item.entityType,
        targetId: item.entityId,
        summary: item.summary,
        metadataJson: item.metadataJson,
        ip: item.ipAddress,
        userAgent: item.userAgent,
        createdAt: item.createdAt.toISOString()
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }
}

function parsePagination(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalEnum<TEnum extends Record<string, string>>(input: Record<string, unknown>, field: string, enumObject: TEnum): TEnum[keyof TEnum] | undefined {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) return undefined;
  return Object.values(enumObject).includes(value) ? (value as TEnum[keyof TEnum]) : undefined;
}

function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok",
    data
  };
}
