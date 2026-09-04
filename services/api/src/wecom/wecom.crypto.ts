import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

export function encryptSecret(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0]!, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  const [prefix, ivText, tagText, encryptedText] = value.split(":");
  if (prefix !== PREFIX || !ivText || !tagText || !encryptedText) return "";
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
      decipher.setAuthTag(Buffer.from(tagText, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
    } catch {
      continue;
    }
  }
  return "";
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function encryptionKeys(): Buffer[] {
  const primary = process.env.WECOM_CONFIG_ENCRYPTION_KEY?.trim();
  const previous = (process.env.WECOM_CONFIG_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const legacyJwtKey = process.env.JWT_SECRET?.trim();
  const sources = Array.from(new Set([primary, ...previous, legacyJwtKey].filter((value): value is string => Boolean(value))));
  if (!sources.length && process.env.NODE_ENV === "production") {
    throw new Error("WECOM_CONFIG_ENCRYPTION_KEY or JWT_SECRET must be configured in production");
  }
  return (sources.length ? sources : ["conference-system-local-wecom-config-key"])
    .map((source) => createHash("sha256").update(source).digest());
}
