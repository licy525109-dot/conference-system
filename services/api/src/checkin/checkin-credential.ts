import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";

const TOKEN_PREFIX = "CONF_REG";
const SIGNATURE_LENGTH = 24;

export interface ParsedCheckinCredential {
  registrationId: string;
  registrationNo: string;
  version?: number;
  attendeeId?: string;
}

export function createCheckinCredentialPayload(registrationId: string, registrationNo: string, version = 0, attendeeId?: string): string {
  return `${TOKEN_PREFIX}:${registrationId}:${registrationNo}:${signCredential(registrationId, registrationNo, version, attendeeId)}${version > 0 || attendeeId ? `:${version}` : ""}${attendeeId ? `:${attendeeId}` : ""}`;
}

export function parseCheckinCredentialPayload(input: string): ParsedCheckinCredential {
  const value = input.trim();
  if (!value.startsWith(`${TOKEN_PREFIX}:`)) {
    return { registrationId: "", registrationNo: value };
  }

  const parts = value.split(":");
  const [, registrationId, registrationNo, signature, rawVersion, attendeeId] = parts;
  const version = rawVersion === undefined ? 0 : Number(rawVersion);
  if (parts.length > 6 || (parts.length === 6 && !attendeeId) || !Number.isSafeInteger(version) || version < 0 || !registrationId || !registrationNo || !signature || !verifyCredentialSignature(registrationId, registrationNo, signature, version, attendeeId)) {
    throw new BadRequestException("二维码无效或已过期");
  }

  return { registrationId, registrationNo, ...(version ? { version } : {}), ...(attendeeId ? { attendeeId } : {}) };
}

export function assertCredentialVersion(parsed: ParsedCheckinCredential, currentVersion: number) {
  if (parsed.registrationId && (parsed.version ?? 0) !== (currentVersion ?? 0)) throw new BadRequestException("参会人信息已变更，请使用最新报名凭证");
}

function signCredential(registrationId: string, registrationNo: string, version = 0, attendeeId?: string): string {
  return createHmac("sha256", readJwtSecret())
    .update(`${registrationId}:${registrationNo}${version > 0 || attendeeId ? `:${version}` : ""}${attendeeId ? `:${attendeeId}` : ""}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);
}

function verifyCredentialSignature(registrationId: string, registrationNo: string, signature: string, version = 0, attendeeId?: string): boolean {
  const expected = signCredential(registrationId, registrationNo, version, attendeeId);
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
