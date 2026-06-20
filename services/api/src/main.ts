import { NestFactory } from "@nestjs/core";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";

const express = require("express") as { static: (root: string) => unknown };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const uploadsRoot = resolve(process.env.UPLOADS_DIR || join(inferProjectRoot(process.cwd()), "uploads"));
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }

  app.use("/uploads", express.static(uploadsRoot));
  app.setGlobalPrefix("api");
  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();

function inferProjectRoot(cwd: string): string {
  if (cwd.endsWith("/services/api")) return resolve(cwd, "../..");
  return cwd;
}
