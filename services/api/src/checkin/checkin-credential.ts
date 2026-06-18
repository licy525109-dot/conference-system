import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";

const TOKEN_PREFIX = "CONF_REG";
const SIGNATURE_LENGTH = 24;

export interface ParsedCheckinCredential {
  registrationId: string;
  registrationNo: string;
}

export function createCheckinCredentialPayload(registrationId: string, registrationNo: string): string {
  return `${TOKEN_PREFIX}:${registrationId}:${registrationNo}:${signCredential(registrationId, registrationNo)}`;
}

export function parseCheckinCredentialPayload(input: string): ParsedCheckinCredential {
  const value = input.trim();
  if (!value.startsWith(`${TOKEN_PREFIX}:`)) {
    return { registrationId: "", registrationNo: value };
  }

  const [, registrationId, registrationNo, signature] = value.split(":");
  if (!registrationId || !registrationNo || !signature || !verifyCredentialSignature(registrationId, registrationNo, signature)) {
    throw new BadRequestException("二维码无效或已过期");
  }

  return { registrationId, registrationNo };
}

function signCredential(registrationId: string, registrationNo: string): string {
  return createHmac("sha256", readJwtSecret())
    .update(`${registrationId}:${registrationNo}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);
}

function verifyCredentialSignature(registrationId: string, registrationNo: string, signature: string): boolean {
  const expected = signCredential(registrationId, registrationNo);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new InternalServerErrorException("JWT_SECRET is not configured");
  }
  return secret;
}
