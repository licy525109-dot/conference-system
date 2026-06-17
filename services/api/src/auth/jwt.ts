import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtPayload {
  sub: string;
  openid: string | null;
  type?: "user" | "admin";
  username?: string;
  iat: number;
  exp?: number;
}

const JWT_HEADER = {
  alg: "HS256",
  typ: "JWT"
};

export function signJwt(payload: JwtPayload, secret: string): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as Partial<typeof JWT_HEADER>;
    if (header.alg !== JWT_HEADER.alg || header.typ !== JWT_HEADER.typ) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<JwtPayload>;
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") {
      return null;
    }
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      sub: payload.sub,
      openid: typeof payload.openid === "string" ? payload.openid : null,
      type: payload.type === "admin" || payload.type === "user" ? payload.type : undefined,
      username: typeof payload.username === "string" ? payload.username : undefined,
      iat: payload.iat,
      exp: typeof payload.exp === "number" ? payload.exp : undefined
    };
  } catch {
    return null;
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
