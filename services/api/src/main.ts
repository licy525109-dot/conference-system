import { NestFactory } from "@nestjs/core";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";
import { assertProductionConfiguration, splitOrigins } from "./security/production-config";
import { createSensitiveEndpointRateLimiter } from "./security/request-rate-limit";

const express = require("express") as { static: (root: string) => unknown };

async function bootstrap() {
  assertProductionConfiguration();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: unknown): void;
  };
  expressApp.disable("x-powered-by");
  expressApp.set("trust proxy", 1);
  const uploadsRoot = resolve(process.env.UPLOADS_DIR || join(inferProjectRoot(process.cwd()), "uploads"));
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }

  app.use((_: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use("/uploads", (_: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  });
  app.use("/uploads", express.static(uploadsRoot));
  app.use(createSensitiveEndpointRateLimiter());
  app.setGlobalPrefix("api");
  const allowedOrigins = splitOrigins(process.env.CORS_ALLOWED_ORIGINS);
  app.enableCors({
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== "production" || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"), false);
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    maxAge: 86_400
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST?.trim() || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
  await app.listen(port, host);
}

void bootstrap();

function inferProjectRoot(cwd: string): string {
  if (cwd.endsWith("/services/api")) return resolve(cwd, "../..");
  return cwd;
}
