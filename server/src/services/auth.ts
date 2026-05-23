import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

type AuthTokenPayload = {
  sub: string;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", config.authSecret).update(value).digest("base64url");
}

function secureCompare(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

export function authIsConfigured(): boolean {
  return Boolean(config.authEmail && config.authPassword && config.authSecret);
}

export function createAuthSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function validateCredentials(email: string, password: string): boolean {
  if (!authIsConfigured()) {
    return false;
  }
  return secureCompare(email.trim().toLowerCase(), config.authEmail.trim().toLowerCase())
    && secureCompare(password, config.authPassword);
}

export function createAuthToken(email: string): string {
  if (!authIsConfigured()) {
    throw new Error("Auth is not configured.");
  }

  const payload: AuthTokenPayload = {
    sub: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + config.authTokenTtlSeconds
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  if (!authIsConfigured()) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature || !secureCompare(sign(body), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
