import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

export function encryptSecret(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  const [prefix, ivText, tagText, encryptedText] = value.split(":");
  if (prefix !== PREFIX || !ivText || !tagText || !encryptedText) return "";
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function encryptionKey(): Buffer {
  const source = process.env.WECOM_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || "conference-system-local-wecom-config-key";
  return createHash("sha256").update(source).digest();
}
