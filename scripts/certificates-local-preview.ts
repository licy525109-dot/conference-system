import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

async function main() {
  const url = new URL(process.env.CERTIFICATE_TEST_DATABASE_URL || "postgresql://certificate_test@127.0.0.1:55441/certificate_test");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/certificate_test") throw new Error("预览仅允许独立本地 certificate_test 数据库");
  process.env.DATABASE_URL = url.toString(); process.env.NODE_ENV = "test"; process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.CERTIFICATE_PUBLIC_ORIGIN = "http://127.0.0.1:5178";
  const req = createRequire(resolve("services/api/package.json")), express = req("express");
  const { NestFactory } = req("@nestjs/core"), { AppModule } = req("./dist/app.module.js"), { PrismaService } = req("./dist/prisma.service.js"), { CertificatesService } = req("./dist/certificates/certificates.service.js"), { AdminAuthService } = req("./dist/admin/admin-auth.service.js");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({ origin: ["http://127.0.0.1:5178", "http://localhost:5178"], allowedHeaders: ["Content-Type", "Authorization"] });
  app.use(express.json({ limit: "4mb" })); app.use("/certificate-assets", express.static(resolve("apps/admin/dist/assets")));
  app.setGlobalPrefix("api", { exclude: [{ path: "c/:publicId", method: 0 }] });
  const db = app.get(PrismaService), service = app.get(CertificatesService), suffix = randomBytes(5).toString("hex");
  const pwd = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex");
  const codes = [...["view", "write", "import", "publish", "export"].map(x => `certificate:${x}`), "theme:view"];
  const role = await db.role.create({ data: { code: `certificate-preview-${suffix}`, name: "证书本地联调", permissions: { create: codes.map(code => ({ permission: { connect: { code } } })) } } });
  const user = await db.adminUser.create({ data: { username: `certificate-preview-${suffix}`, displayName: "证书演示管理员", passwordHash: `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(pwd, salt, 10000, 64, "sha512").toString("hex")}`, conferenceScopeMode: "ALL", roles: { create: { roleId: role.id } } } });
  const admin = { id: user.id, username: user.username, displayName: "证书联调管理员", conferenceScopeMode: "ALL", conferenceIds: [], permissions: codes };
  let a = await service.create({ name: "证书联调 · 会议 A" }, admin);
  for (const [index, name] of ["联调嘉宾甲", "同名演示", "同名演示"].entries()) a = await service.addRecipient(a.id, { draftRevision: a.draftRevision, record: { name, organization: `演示单位${index+1}`, certificateNo: `DEMO-A-${index+1}`, claimCode: `DEMO-CODE-${index+1}`, templateId: "default", eligible: true } }, admin);
  a = await service.publish(a.id, { draftRevision: a.draftRevision }, admin);
  const b = await service.create({ name: "证书联调 · 会议 B" }, admin);
  const session = await app.get(AdminAuthService).login({ username: user.username, password: pwd });
  await mkdir(resolve(".tmp"), { recursive: true });
  const port = Number(process.env.CERTIFICATE_TEST_API_PORT || 3317);
  await app.listen(port, "127.0.0.1");
  await writeFile(resolve(".tmp/certificate-preview-session.json"), JSON.stringify({ token: session.data.token, adminUrl: "http://127.0.0.1:5178/#/certificates", apiOrigin: `http://127.0.0.1:${port}`, a, b, credentials: { name: "联调嘉宾甲", claimCode: "DEMO-CODE-1" } }), { mode: 0o600 });
  await writeFile(resolve(".tmp/certificate-preview-login.txt"), `仅用于本机独立测试数据库\n后台：http://127.0.0.1:5178/#/certificates\n用户名：${user.username}\n密码：${pwd}\n演示会议 A 查询：联调嘉宾甲 / DEMO-CODE-1\n`, { mode: 0o600 });
  console.log(`证书联调 API：http://127.0.0.1:${port}；后台：http://127.0.0.1:5178/#/certificates。会话仅保存在忽略的本地临时文件。`);
  const shutdown = async () => { await app.close(); process.exit(0); }; process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}
main().catch(error => { console.error("本地证书预览启动失败：", error?.code || error?.name, String(error?.message || "请检查独立测试数据库、迁移与 API 构建").split("\n")[0]); process.exitCode = 1; });
