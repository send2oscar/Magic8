import { describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: { cookieSecret: "test-session-secret" },
}));

import { createTryOnSourceUrl } from "./tryOnSource";

describe("createTryOnSourceUrl", () => {
  it("creates an expiring signed application relay URL without exposing a storage URL", () => {
    const url = new URL(createTryOnSourceUrl({
      protocol: "https",
      headers: { host: "app.example.test" },
    } as any, "photos/1/original.png"));

    expect(url.origin).toBe("https://app.example.test");
    expect(url.pathname).toBe("/api/try-on-source");
    expect(url.searchParams.get("key")).toBe("photos/1/original.png");
    expect(url.searchParams.get("signature")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(url.toString()).not.toContain("cloudfront");
  });
});
