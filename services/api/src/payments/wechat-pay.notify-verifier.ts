import { createDecipheriv, verify as verifyCrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";

export interface WechatPayHeaders {
  timestamp: string;
  nonce: string;
  signature: string;
  serial: string;
}

export interface WechatPayEncryptedResource {
  algorithm: string;
  ciphertext: string;
  nonce: string;
  associated_data?: string;
}

@Injectable()
export class WechatPayNotifyVerifier {
  verifySignature(input: {
    headers: WechatPayHeaders;
    rawBody: Buffer;
  }): void {
    const timestamp = input.headers.timestamp.trim();
    const nonce = input.headers.nonce.trim();
    const signature = input.headers.signature.trim();
    const serial = input.headers.serial.trim();
    if (!timestamp || !nonce || !signature || !serial) {
      throw new UnauthorizedException("Missing WeChat Pay notify signature headers");
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isInteger(timestampSeconds)) {
      throw new UnauthorizedException("Invalid WeChat Pay notify timestamp");
    }
    const toleranceSeconds = readTimestampToleranceSeconds();
    const nowSeconds = Math.floor(this.getCurrentTime().getTime() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
      throw new UnauthorizedException("Expired WeChat Pay notify timestamp");
    }

    const configuredKeyId = readWechatPayVerificationKeyId();
    if (!configuredKeyId) {
      throw new InternalServerErrorException("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID or WECHAT_PAY_PLATFORM_CERT_SERIAL_NO is not configured");
    }
    if (serial !== configuredKeyId) {
      throw new UnauthorizedException("Wechatpay-Serial does not match the configured verification key");
    }

    const publicKeyPath = process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH?.trim();
    if (!publicKeyPath) {
      throw new InternalServerErrorException("WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH is not configured for notify signature verification");
    }

    let publicKey: string;
    try {
      publicKey = readFileSync(publicKeyPath, "utf8");
    } catch {
      throw new InternalServerErrorException("WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH cannot be read");
    }

    const message = `${timestamp}\n${nonce}\n${input.rawBody.toString("utf8")}\n`;
    let valid = false;
    try {
      valid = verifyCrypto(
        "RSA-SHA256",
        Buffer.from(message, "utf8"),
        publicKey,
        Buffer.from(signature, "base64")
      );
    } catch {
      throw new UnauthorizedException("Invalid WeChat Pay notify signature");
    }

    if (!valid) {
      throw new UnauthorizedException("Invalid WeChat Pay notify signature");
    }
  }

  protected getCurrentTime(): Date {
    return new Date();
  }

  decryptResource(resource: WechatPayEncryptedResource, apiV3Key: string): Record<string, unknown> {
    if (resource.algorithm !== "AEAD_AES_256_GCM") {
      throw new BadRequestException("Unsupported WeChat Pay resource algorithm");
    }

    try {
      const ciphertext = Buffer.from(resource.ciphertext, "base64");
      const authTag = ciphertext.subarray(ciphertext.length - 16);
      const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
      if (resource.associated_data) {
        decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
      }
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      const payload = JSON.parse(decrypted) as unknown;
      if (!isRecord(payload)) {
        throw new BadRequestException("WeChat Pay resource payload is invalid");
      }
      return payload;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException("WeChat Pay resource decrypt failed");
    }
  }
}

function readWechatPayVerificationKeyId(): string | null {
  return process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID?.trim()
    || process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO?.trim()
    || null;
}

function readTimestampToleranceSeconds(): number {
  const configured = Number(process.env.WECHAT_PAY_NOTIFY_TIMESTAMP_TOLERANCE_SECONDS ?? "300");
  return Number.isInteger(configured) && configured >= 60 && configured <= 900 ? configured : 300;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
