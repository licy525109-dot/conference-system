import { BadRequestException, GatewayTimeoutException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface PublicFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
}

export function assertPublicHttpUrl(value: string, label = "URL"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(`${label} 格式无效`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new BadRequestException(`${label} 必须是不含账号密码的 http/https 地址`);
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new BadRequestException(`${label} 不能指向本机或内网地址`);
  }
  return url;
}

export async function fetchPublicUrl(
  value: string,
  init: RequestInit = {},
  options: PublicFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  let current = assertPublicHttpUrl(value);

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      await assertPublicDnsResolution(current);
      const response = await fetch(current, { ...init, redirect: "manual", signal: controller.signal });
      if (!isRedirect(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      if (redirectCount === maxRedirects) throw new BadRequestException("外部 URL 重定向次数过多");
      current = assertPublicHttpUrl(new URL(location, current).toString(), "重定向 URL");
    }
    throw new BadRequestException("外部 URL 重定向次数过多");
  } catch (error) {
    if (isAbortError(error)) throw new GatewayTimeoutException("外部 URL 请求超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertPublicDnsResolution(url: URL, label = "URL"): Promise<void> {
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException(`${label} 域名无法解析`);
  }
  assertPublicResolvedAddresses(addresses.map((item) => item.address), label);
}

export function assertPublicResolvedAddresses(addresses: string[], label = "URL"): void {
  if (addresses.length === 0 || addresses.some((address) => isPrivateOrLocalHostname(address))) {
    throw new BadRequestException(`${label} 域名解析到了本机、内网或保留地址`);
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function isPrivateOrLocalHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
  ) return true;

  const version = isIP(hostname);
  if (version === 4) return isPrivateIpv4(hostname);
  if (version === 6) return isPrivateIpv6(hostname);
  return false;
}

function isPrivateIpv4(value: string): boolean {
  const [a, b, c] = value.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
  const mappedHex = normalized.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mappedHex) return false;
  const high = Number.parseInt(mappedHex[1], 16);
  const low = Number.parseInt(mappedHex[2], 16);
  return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
