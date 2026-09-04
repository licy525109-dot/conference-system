export function resolvePublicOrigin(headers?: Record<string, string | string[] | undefined>): string {
  const configured = process.env.PUBLIC_ORIGIN
    || process.env.PUBLIC_BASE_URL
    || process.env.PUBLIC_API_BASE_URL
    || process.env.API_PUBLIC_BASE_URL;
  if (configured) return parseOrigin(configured);

  const forwardedProto = readFirstHeader(headers?.["x-forwarded-proto"]);
  const forwardedHost = readFirstHeader(headers?.["x-forwarded-host"]);
  const host = forwardedHost || readFirstHeader(headers?.host) || "localhost:3000";
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return parseOrigin(`${proto}://${host}`);
}

function parseOrigin(value: string): string {
  const url = new URL(value.trim());
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Public origin must use HTTPS in production");
  }
  return url.origin;
}

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
