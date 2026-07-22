import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

export const ADMIN_SESSION_COOKIE = "shirt_changer_admin_session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

type AdminSessionPayload = {
  version: 1;
  expiresAt: number;
  nonce: string;
};

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME?.trim() ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? "",
  };
}

function safelyMatches(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function signSessionPayload(payload: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = item.trim().split("=");
    if (cookieName === name) return valueParts.join("=") || null;
  }
  return null;
}

export function isAdminLoginConfigured(): boolean {
  const config = getAdminConfig();
  return Boolean(config.username && config.password && config.sessionSecret);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const config = getAdminConfig();
  if (!config.username || !config.password || !config.sessionSecret) return false;
  return safelyMatches(username, config.username) && safelyMatches(password, config.password);
}

export function createAdminSession(req: Request, res: Response): void {
  const { sessionSecret } = getAdminConfig();
  if (!sessionSecret) throw new Error("Admin session is not configured");
  const payload: AdminSessionPayload = {
    version: 1,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sessionToken = `${encodedPayload}.${signSessionPayload(encodedPayload, sessionSecret)}`;
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
    ...cookieOptions,
    sameSite: "strict",
    maxAge: ADMIN_SESSION_TTL_MS,
  });
}

export function clearAdminSession(req: Request, res: Response): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(ADMIN_SESSION_COOKIE, { ...cookieOptions, sameSite: "strict", maxAge: -1 });
}

export function hasAdminSession(req: Request): boolean {
  const { sessionSecret } = getAdminConfig();
  if (!sessionSecret) return false;
  const sessionToken = readCookie(req, ADMIN_SESSION_COOKIE);
  if (!sessionToken) return false;
  const [encodedPayload, signature, ...extraParts] = sessionToken.split(".");
  if (!encodedPayload || !signature || extraParts.length > 0) return false;

  const expectedSignature = signSessionPayload(encodedPayload, sessionSecret);
  if (!safelyMatches(signature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    return payload.version === 1
      && typeof payload.expiresAt === "number"
      && Number.isFinite(payload.expiresAt)
      && payload.expiresAt > Date.now()
      && typeof payload.nonce === "string"
      && payload.nonce.length > 0;
  } catch {
    return false;
  }
}
