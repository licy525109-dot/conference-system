import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createDecipheriv, createHash } from "node:crypto";
import { PrismaService } from "../../prisma.service";
import { decryptSecret } from "../wecom.crypto";
import { formatDateFields, readPage } from "./wecom-customer-group.service";
import { ok } from "./wecom-config.service";

@Injectable()
export class WecomCallbackService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(source: string, query: Record<string, unknown>) {
    const integration = await this.prisma.wecomIntegration.findUnique({ where: { name: "default" } });
    const token = decryptSecret(integration?.callbackTokenEnc);
    const aesKey = decryptSecret(integration?.callbackEncodingAesKeyEnc);
    const msgSignature = stringValue(query.msg_signature);
    const timestamp = stringValue(query.timestamp);
    const nonce = stringValue(query.nonce);
    const echo = stringValue(query.echostr);
    if (!token || !aesKey || !msgSignature || !timestamp || !nonce || !echo) return "";
    if (signature(token, timestamp, nonce, echo) !== msgSignature) return "";
    return decryptWecomMessage(aesKey, echo);
  }

  async receive(source: string, query: Record<string, unknown>, rawBody: string) {
    const integration = await this.prisma.wecomIntegration.findUnique({ where: { name: "default" } });
    let decryptedXml = "";
    let status = "RECEIVED";
    let errorMessage: string | null = null;
    try {
      const token = decryptSecret(integration?.callbackTokenEnc);
      const aesKey = decryptSecret(integration?.callbackEncodingAesKeyEnc);
      const encrypted = matchXml(rawBody, "Encrypt");
      if (token && aesKey && encrypted) {
        const msgSignature = stringValue(query.msg_signature);
        const timestamp = stringValue(query.timestamp);
        const nonce = stringValue(query.nonce);
        if (signature(token, timestamp, nonce, encrypted) === msgSignature) {
          decryptedXml = decryptWecomMessage(aesKey, encrypted);
          status = "PROCESSED";
        } else {
          status = "FAILED";
          errorMessage = "Invalid WeCom callback signature";
        }
      }
    } catch (error) {
      status = "FAILED";
      errorMessage = error instanceof Error ? error.message : "WeCom callback decrypt failed";
    }

    const payload = decryptedXml || rawBody;
    const event = await this.prisma.wecomCallbackEvent.create({
      data: {
        integrationId: integration?.id,
        eventSource: source,
        eventType: matchXml(payload, "Event"),
        changeType: matchXml(payload, "ChangeType"),
        fromUserName: matchXml(payload, "FromUserName"),
        externalUserId: matchXml(payload, "ExternalUserID"),
        chatId: matchXml(payload, "ChatId"),
        rawPayload: { query: query as Prisma.InputJsonObject, received: rawBody },
        decryptedXml,
        status,
        errorMessage
      }
    });
    if (integration) await this.prisma.wecomIntegration.update({ where: { id: integration.id }, data: { lastCallbackAt: new Date(), verified: status !== "FAILED" } });
    return ok(formatDateFields(event));
  }

  async listEvents(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wecomCallbackEvent.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.wecomCallbackEvent.count()
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }
}

function signature(token: string, timestamp: string, nonce: string, encrypted: string): string {
  return createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest("hex");
}

function decryptWecomMessage(encodingAesKey: string, encrypted: string): string {
  const key = Buffer.from(`${encodingAesKey}=`, "base64");
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(true);
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]);
  const length = plain.readUInt32BE(16);
  return plain.subarray(20, 20 + length).toString("utf8");
}

function matchXml(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] || match?.[2] || null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
