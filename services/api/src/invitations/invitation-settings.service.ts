import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret } from "../wecom/wecom.crypto";
import type { CurrentAdmin } from "../admin/current-admin";
import { invitationOrigin } from "./invitation-policy";
import { readObject } from "./invitations.service";

@Injectable()
export class InvitationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private record() {
    return this.prisma.invitationWechatConfig.findUnique({
      where: { id: "official" },
    });
  }

  async credentials(includeDisabled = false) {
    const config = await this.record();
    if (config) {
      if (!includeDisabled && !config.enabled) return null;
      const secret = decryptSecret(config.appSecretEnc);
      return config.appId && secret ? { appId: config.appId, secret } : null;
    }
    const appId = process.env.WECHAT_OFFICIAL_APP_ID?.trim();
    const secret = process.env.WECHAT_OFFICIAL_APP_SECRET?.trim();
    return appId && secret ? { appId, secret } : null;
  }

  async get() {
    const config = await this.record();
    const appId =
      config?.appId ?? process.env.WECHAT_OFFICIAL_APP_ID?.trim() ?? "";
    const secretConfigured = config
      ? Boolean(decryptSecret(config.appSecretEnc))
      : Boolean(process.env.WECHAT_OFFICIAL_APP_SECRET?.trim());
    return {
      revision: config?.revision ?? 0,
      enabled: config?.enabled ?? Boolean(appId && secretConfigured),
      appId,
      secretConfigured,
      source: config
        ? "database"
        : appId || secretConfigured
          ? "environment"
          : "none",
      domain: new URL(invitationOrigin()).hostname,
      verificationFileName: config?.verificationFileName ?? "",
      verificationUrl: config?.verificationFileName
        ? `${invitationOrigin()}/${config.verificationFileName}`
        : "",
    };
  }

  async save(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    if (
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 0 ||
      typeof body.enabled !== "boolean"
    )
      throw new BadRequestException("配置版本或启用状态无效，请刷新后重试");
    const current = await this.record();
    if ((current?.revision ?? 0) !== body.revision)
      throw new ConflictException("公众号配置已更新，请重新打开后编辑");
    const appId = typeof body.appId === "string" ? body.appId.trim() : "";
    if (appId && !/^wx[A-Za-z0-9]{16}$/.test(appId))
      throw new BadRequestException("请填写正确的公众号 AppID");
    if (body.appSecret !== undefined && typeof body.appSecret !== "string")
      throw new BadRequestException("公众号密钥格式无效");
    const secret =
      typeof body.appSecret === "string" ? body.appSecret.trim() : "";
    if (secret && !/^[A-Za-z0-9]{32}$/.test(secret))
      throw new BadRequestException("请填写完整的公众号 AppSecret");
    const previousId =
      current?.appId ?? process.env.WECHAT_OFFICIAL_APP_ID?.trim() ?? "";
    const previousSecret = current
      ? decryptSecret(current.appSecretEnc)
      : (process.env.WECHAT_OFFICIAL_APP_SECRET?.trim() ?? "");
    if (appId !== previousId && !secret)
      throw new BadRequestException("更换 AppID 时必须同时填写新的 AppSecret");
    const resolvedSecret = secret || previousSecret;
    if (body.enabled && (!appId || !resolvedSecret))
      throw new BadRequestException("启用前请填写公众号 AppID 和 AppSecret");
    let verificationFileName = current?.verificationFileName ?? null;
    let verificationContent = current?.verificationContent ?? null;
    if (body.verificationFile !== undefined) {
      if (body.verificationFile === null) {
        verificationFileName = verificationContent = null;
      } else {
        const file = readObject(body.verificationFile);
        if (
          typeof file.name !== "string" ||
          !/^MP_verify_[A-Za-z0-9]{1,80}\.txt$/.test(file.name) ||
          typeof file.content !== "string" ||
          file.content.length > 1024 ||
          !/^[A-Za-z0-9_-]{8,256}$/.test(file.content.trim())
        )
          throw new BadRequestException(
            "请上传微信提供的 MP_verify_*.txt 纯文本校验文件",
          );
        verificationFileName = file.name;
        verificationContent = file.content.trim();
      }
    }
    const data = {
      enabled: body.enabled,
      appId,
      appSecretEnc:
        secret || !current
          ? encryptSecret(resolvedSecret)
          : current.appSecretEnc,
      verificationFileName,
      verificationContent,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        if (current) {
          const updated = await tx.invitationWechatConfig.updateMany({
            where: { id: "official", revision: Number(body.revision) },
            data: { ...data, revision: { increment: 1 } },
          });
          if (!updated.count)
            throw new ConflictException("公众号配置已更新，请重新打开后编辑");
        } else {
          await tx.invitationWechatConfig.create({
            data: { id: "official", ...data },
          });
        }
        await tx.auditLog.create({
          data: {
            adminUserId: admin.id,
            action: AuditAction.UPDATE,
            entityType: "invitation_wechat_config",
            entityId: "official",
            summary: "更新邀请函公众号配置",
          },
        });
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new ConflictException("公众号配置已更新，请重新打开后编辑");
      throw error;
    }
    return this.get();
  }

  async verification(code: string) {
    if (!/^[A-Za-z0-9]{1,80}$/.test(code)) throw new NotFoundException();
    const config = await this.record();
    if (
      !config?.verificationContent ||
      config.verificationFileName !== `MP_verify_${code}.txt`
    )
      throw new NotFoundException();
    return config.verificationContent;
  }
}
