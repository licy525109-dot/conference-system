import { PrismaClient } from "@prisma/client";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.INVITATION_TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "Provide an explicitly isolated local INVITATION_TEST_DATABASE_URL",
  );
}
const db = new PrismaClient({ datasources: { db: { url } } });
try {
  const username = "invitation-local-preview";
  const password = randomBytes(12).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `pbkdf2$sha512$210000$${salt}$${pbkdf2Sync(password, salt, 210000, 64, "sha512").toString("hex")}`;
  const codes = ["view", "write", "content", "publish", "all", "access", "settings"].map(
    (code) => `invitation:${code}`,
  );
  const permissions = await db.permission.findMany({
    where: { code: { in: codes } },
  });
  if (permissions.length !== codes.length)
    throw new Error("Run the invitation integration fixture first");
  const role = await db.role.upsert({
    where: { code: "invitation_local_preview" },
    update: {},
    create: {
      code: "invitation_local_preview",
      name: "本地邀请函演示",
      permissions: {
        create: permissions.map((permission) => ({
          permissionId: permission.id,
        })),
      },
    },
  });
  for (const permission of permissions) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  const admin = await db.adminUser.upsert({
    where: { username },
    update: { passwordHash, enabled: true },
    create: { username, passwordHash, displayName: "本地邀请函演示" },
  });
  await db.adminUserRole.upsert({
    where: { adminUserId_roleId: { adminUserId: admin.id, roleId: role.id } },
    update: {},
    create: { adminUserId: admin.id, roleId: role.id },
  });
  await mkdir(".tmp", { recursive: true });
  await writeFile(
    ".tmp/invitation-preview-access.json",
    JSON.stringify(
      {
        url: "http://localhost:5174/#/invitations",
        username,
        password,
        note: "仅供本机隔离测试库使用，不是正式站点账号。重新运行本脚本会轮换此密码。",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log("Local preview credentials: .tmp/invitation-preview-access.json");
} finally {
  await db.$disconnect();
}
