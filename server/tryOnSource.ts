import type { Express, Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { storageGetSignedUrl } from "./storage";
import { ENV } from "./_core/env";

const RELAY_PATH = "/api/try-on-source";
const RELAY_TTL_SECONDS = 5 * 60;

function getSigningSecret(): string {
  if (!ENV.cookieSecret) throw new Error("Session signing is not configured");
  return ENV.cookieSecret;
}

function signRelayKey(photoKey: string, expiresAt: number): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${photoKey}:${expiresAt}`)
    .digest("base64url");
}

function signaturesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getPublicRequestOrigin(req: Pick<Request, "protocol" | "headers">): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  if (!host || /[\s/@]/.test(host)) throw new Error("A safe public request host is required");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol || "https")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (protocol !== "https" && protocol !== "http") throw new Error("A safe public request protocol is required");
  return `${protocol}://${host}`;
}

/**
 * Builds a provider-readable URL without exposing an S3/CloudFront signed URL.
 * The URL carries a short-lived HMAC and is valid only for one stored source key.
 */
export function createTryOnSourceUrl(req: Pick<Request, "protocol" | "headers">, photoKey: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + RELAY_TTL_SECONDS;
  const url = new URL(RELAY_PATH, getPublicRequestOrigin(req));
  url.searchParams.set("key", photoKey);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signRelayKey(photoKey, expiresAt));
  return url.toString();
}

/** Streams a stored source image only after validating its short-lived HMAC relay token. */
export function registerTryOnSourceRelay(app: Express) {
  app.get(RELAY_PATH, async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    const expires = Number(req.query.expires);
    const signature = typeof req.query.signature === "string" ? req.query.signature : "";
    const now = Math.floor(Date.now() / 1000);

    if (!key || !Number.isSafeInteger(expires) || expires < now || expires > now + RELAY_TTL_SECONDS + 15 || !signature || !signaturesMatch(signRelayKey(key, expires), signature)) {
      res.status(403).send("Source image access denied");
      return;
    }

    try {
      const signedUrl = await storageGetSignedUrl(key);
      const sourceResponse = await fetch(signedUrl);
      if (!sourceResponse.ok) {
        console.error("[TryOnSourceRelay] storage retrieval failed", { status: sourceResponse.status });
        res.status(502).send("Source image unavailable");
        return;
      }

      const contentType = sourceResponse.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        res.status(415).send("Unsupported source image");
        return;
      }

      const imageBytes = Buffer.from(await sourceResponse.arrayBuffer());
      if (!imageBytes.length || imageBytes.length > 25 * 1024 * 1024) {
        res.status(413).send("Source image is unavailable");
        return;
      }

      res.set({
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": contentType,
        "Content-Length": String(imageBytes.length),
        "X-Content-Type-Options": "nosniff",
      });
      res.send(imageBytes);
    } catch (error) {
      console.error("[TryOnSourceRelay] failed to retrieve source image", { category: "storage_or_network" });
      res.status(502).send("Source image unavailable");
    }
  });
}
