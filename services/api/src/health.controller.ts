import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

interface HealthResponse {
  status: "ok";
  service: "conference-api";
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "conference-api"
    };
  }

  @Get("ready")
  async getReadiness() {
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return {
        status: "ready" as const,
        service: "conference-api" as const,
        database: "ok" as const
      };
    } catch {
      throw new ServiceUnavailableException({
        code: "SERVICE_NOT_READY",
        message: "Database readiness check failed"
      });
    }
  }
}
