import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { HealthController } from "./health.controller";

describe("HealthController readiness", () => {
  it("reports ready only after the database responds", async () => {
    const controller = new HealthController({
      $queryRaw: async () => [{ ok: 1 }]
    } as unknown as PrismaService);

    assert.deepEqual(await controller.getReadiness(), {
      status: "ready",
      service: "conference-api",
      database: "ok"
    });
  });

  it("fails closed without exposing the database error", async () => {
    const controller = new HealthController({
      $queryRaw: async () => {
        throw new Error("postgresql://secret-host/private-db");
      }
    } as unknown as PrismaService);

    await assert.rejects(() => controller.getReadiness(), (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.equal(error.message.includes("secret-host"), false);
      return true;
    });
  });
});
