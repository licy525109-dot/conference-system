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

    const message = `${input.headers.timestamp}\n${input.headers.nonce}\n${input.rawBody.toString("utf8")}\n`;
    const valid = verifyCrypto(
      "RSA-SHA256",
      Buffer.from(message, "utf8"),
      publicKey,
      Buffer.from(input.headers.signature, "base64")
    );

    if (!valid) {
      throw new UnauthorizedException("Invalid WeChat Pay notify signature");
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
