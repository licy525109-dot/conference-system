import { pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { ADMIN_PERMISSIONS, SUPER_ADMIN_ROLE_CODE } from "../services/api/src/admin/admin-permissions";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const iterations = 120_000;
  const digest = "sha512";
  const hash = pbkdf2Sync(password, salt, iterations, 64, digest).toString("hex");
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

async function main() {
  const existingAdmin = await prisma.adminUser.findUnique({ where: { username: "admin" }, select: { id: true } });
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  if (!existingAdmin && !bootstrapPassword) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required when creating the initial admin account");
  }

  const admin = await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {
      displayName: "系统管理员",
      enabled: true,
      ...(bootstrapPassword ? { passwordHash: hashPassword(bootstrapPassword) } : {})
    },
    create: {
      username: "admin",
      passwordHash: hashPassword(bootstrapPassword!),
      displayName: "系统管理员",
      enabled: true
    }
  });

  for (const permission of ADMIN_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { name: permission.name, group: permission.group },
      create: permission
    });
  }
  const superAdminRole = await prisma.role.upsert({
    where: { code: SUPER_ADMIN_ROLE_CODE },
    update: { name: "超级管理员", description: "拥有后台全部权限", system: true, enabled: true },
    create: { code: SUPER_ADMIN_ROLE_CODE, name: "超级管理员", description: "拥有后台全部权限", system: true, enabled: true }
  });
  const permissions = await prisma.permission.findMany({ where: { code: { in: [...ADMIN_PERMISSIONS.map((item) => item.code)] } }, select: { id: true } });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permission.id }
    });
  }
  await prisma.adminUserRole.upsert({
    where: { adminUserId_roleId: { adminUserId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { adminUserId: admin.id, roleId: superAdminRole.id }
  });

  const conference = await prisma.conference.upsert({
    where: { slug: "mvp-conference-2026" },
    update: {
      title: "会议报名缴费 MVP 示例会议",
      summary: "用于本地开发和验收的示例会议。",
      location: "上海",
      status: "PUBLISHED",
      sortOrder: 1
    },
    create: {
      title: "会议报名缴费 MVP 示例会议",
      slug: "mvp-conference-2026",
      summary: "用于本地开发和验收的示例会议。",
      location: "上海",
      startsAt: new Date("2026-08-01T09:00:00.000Z"),
      endsAt: new Date("2026-08-03T18:00:00.000Z"),
      registrationStartsAt: new Date("2026-06-01T00:00:00.000Z"),
      registrationEndsAt: new Date("2026-07-20T23:59:59.000Z"),
      status: "PUBLISHED",
      sortOrder: 1
    }
  });

  await prisma.conferencePage.upsert({
    where: { conferenceId: conference.id },
    update: {
      contentJson: {
        blocks: [
          { type: "heading", text: "会议报名缴费 MVP 示例会议" },
          { type: "paragraph", text: "这里是会议详情内容占位，后续由后台维护。" }
        ]
      } as Prisma.InputJsonObject
    },
    create: {
      conferenceId: conference.id,
      contentJson: {
        blocks: [
          { type: "heading", text: "会议报名缴费 MVP 示例会议" },
          { type: "paragraph", text: "这里是会议详情内容占位，后续由后台维护。" }
        ]
      } as Prisma.InputJsonObject
    }
  });

  await prisma.registrationSku.upsert({
    where: {
      conferenceId_name: {
        conferenceId: conference.id,
        name: "住宿+参会"
      }
    },
    update: {
      description: "包含会议报名和住宿。",
      priceCent: 100000,
      stock: 100,
      status: "ACTIVE",
      sortOrder: 1
    },
    create: {
      conferenceId: conference.id,
      name: "住宿+参会",
      description: "包含会议报名和住宿。",
      priceCent: 100000,
      stock: 100,
      status: "ACTIVE",
      sortOrder: 1
    }
  });

  await prisma.registrationSku.upsert({
    where: {
      conferenceId_name: {
        conferenceId: conference.id,
        name: "仅参会"
      }
    },
    update: {
      description: "仅包含会议报名，不含住宿。",
      priceCent: 70000,
      stock: 200,
      status: "ACTIVE",
      sortOrder: 2
    },
    create: {
      conferenceId: conference.id,
      name: "仅参会",
      description: "仅包含会议报名，不含住宿。",
      priceCent: 70000,
      stock: 200,
      status: "ACTIVE",
      sortOrder: 2
    }
  });

  const form = await prisma.formDefinition.upsert({
    where: { conferenceId: conference.id },
    update: {
      title: "报名信息",
      description: "请填写参会人真实信息。"
    },
    create: {
      conferenceId: conference.id,
      title: "报名信息",
      description: "请填写参会人真实信息。"
    }
  });

  const fields = [
    {
      label: "姓名",
      fieldKey: "name",
      type: "TEXT" as const,
      required: true,
      placeholder: "请输入姓名",
      sortOrder: 1
    },
    {
      label: "手机号",
      fieldKey: "phone",
      type: "PHONE" as const,
      required: true,
      placeholder: "请输入手机号",
      sortOrder: 2,
      validationJson: {
        pattern: "^1[3-9]\\d{9}$",
        message: "请输入有效的中国大陆手机号"
      } as Prisma.InputJsonObject
    },
    {
      label: "公司",
      fieldKey: "company",
      type: "TEXT" as const,
      required: false,
      placeholder: "请输入公司名称",
      sortOrder: 3
    },
    {
      label: "职位",
      fieldKey: "position",
      type: "TEXT" as const,
      required: false,
      placeholder: "请输入职位",
      sortOrder: 4
    }
  ];

  for (const field of fields) {
    await prisma.formField.upsert({
      where: {
        formDefinitionId_fieldKey: {
          formDefinitionId: form.id,
          fieldKey: field.fieldKey
        }
      },
      update: {
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        validationJson: "validationJson" in field ? field.validationJson : undefined,
        sortOrder: field.sortOrder,
        enabled: true
      },
      create: {
        formDefinitionId: form.id,
        label: field.label,
        fieldKey: field.fieldKey,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        optionsJson: [],
        validationJson: "validationJson" in field ? field.validationJson : undefined,
        sortOrder: field.sortOrder,
        enabled: true
      }
    });
  }

  console.log("Seed completed: admin user, conference, SKUs, form definition, and form fields are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
