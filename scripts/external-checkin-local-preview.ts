import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

async function main() {
  const url = new URL(process.env.EXTERNAL_CHECKIN_TEST_DATABASE_URL || "postgresql://external_checkin_test@127.0.0.1:55443/external_checkin_test");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/external_checkin_test") throw new Error("预览仅允许独立本地 external_checkin_test 数据库");
  process.env.DATABASE_URL = url.toString(); process.env.NODE_ENV = "test"; process.env.JWT_SECRET = randomBytes(48).toString("hex");
  const req = createRequire(resolve("services/api/package.json")), express = req("express");
  const { NestFactory } = req("@nestjs/core"), { AppModule } = req("./dist/app.module.js"), { PrismaService } = req("./dist/prisma.service.js"), { ExternalCheckinService } = req("./dist/external-checkin/external-checkin.service.js"), { AdminAuthService } = req("./dist/admin/admin-auth.service.js");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({ origin: ["http://127.0.0.1:5183", "http://localhost:5183"], allowedHeaders: ["Content-Type", "Authorization"] });
  app.use(express.json({ limit: "4mb" })); app.use("/api/external-checkin-assets", express.static(resolve("apps/admin/dist/assets")));
  app.use(req("./dist/security/request-rate-limit.js").createSensitiveEndpointRateLimiter()); app.setGlobalPrefix("api");
  const db = app.get(PrismaService), service = app.get(ExternalCheckinService), suffix = randomBytes(5).toString("hex");
  await app.get(req("./dist/admin/admin-access.service.js").AdminAccessService).ensureBuiltInAccess();
  const sessionPath = resolve(".tmp/external-checkin-preview-session.json");
  const previous = await readFile(sessionPath, "utf8").then(text => JSON.parse(text)).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const password = previous?.password || randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex"), codes = ["external-checkin:view", "external-checkin:write", "theme:view"];
  let user, event;
  if (previous) {
    user = await db.adminUser.findUniqueOrThrow({ where: { username: previous.username } });
    event = await service.detail(previous.event.id, { id: user.id, username: user.username, displayName: user.displayName, conferenceScopeMode: "ALL", permissions: codes });
  } else {
  const role = await db.role.create({ data: { code: `external-preview-${suffix}`, name: "外部签到本地测试", permissions: { create: codes.map(code => ({ permission: { connect: { code } } })) } } });
  user = await db.adminUser.create({ data: { username: `external-preview-${suffix}`, displayName: "签到本地测试", passwordHash: `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")}`, conferenceScopeMode: "ALL", roles: { create: { roleId: role.id } } } });
  const admin = { id: user.id, username: user.username, displayName: "签到本地测试", conferenceScopeMode: "ALL", permissions: codes };
  const fields = [{ key: "name", label: "姓名", input: true, required: true, match: false }, { key: "code", label: "报名编号", input: true, required: true, match: true }, { key: "company", label: "单位", input: true, required: false, match: false }, { key: "seat", label: "座位", input: false, required: false, match: false }];
  event = await service.create({ title: "【测试数据】外部协同会议", description: "欢迎参会，请填写以下信息完成现场签到。", fields }, admin);
  const body = { revision: event.revision, rows: [{ name: "测试嘉宾甲", code: "001", company: "原单位甲", seat: "A01" }, { name: "测试嘉宾乙", code: "002", company: "原单位乙", seat: "A02" }] };
  const plan = await service.import(event.id, body, admin, false); event = await service.import(event.id, { ...body, digest: plan.digest }, admin, true); event = await service.save(event.id, { ...event, enabled: true }, admin);
  }
  const login = await app.get(AdminAuthService).login({ username: user.username, password });
  await mkdir(resolve(".tmp"), { recursive: true });
  await app.listen(3323, "127.0.0.1");
  await writeFile(sessionPath, JSON.stringify({ token: login.data.token, username: user.username, password, event, publicUrl: `http://127.0.0.1:3323${event.publicPath}`, adminUrl: "http://127.0.0.1:5183/#/external-checkins" }), { mode: 0o600 });
  console.log(`本地签到预览已就绪：后台 http://127.0.0.1:5183/#/external-checkins，API http://127.0.0.1:3323。仅使用独立测试数据库，会话保存在忽略的 .tmp 文件中。`);
  const close = async () => { await app.close(); process.exit(0); }; process.on("SIGINT", close); process.on("SIGTERM", close);
}
main().catch(error => { console.error("预览启动失败：", error?.code || error?.name); process.exitCode = 1; });
