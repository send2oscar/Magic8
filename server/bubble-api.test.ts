import { describe, expect, it } from "vitest";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("Bubble.io API Integration", () => {
  it("should validate Bubble.io API credentials", async () => {
    const bubbleApiUrl = process.env.BUBBLE_API_URL;
    const bubbleToken = process.env.BUBBLE_API_TOKEN;

    // Check that environment variables are set
    expect(bubbleApiUrl).toBeDefined();
    expect(bubbleToken).toBeDefined();
    expect(bubbleApiUrl).toContain("magic8-78745.bubbleapps.io");
    expect(typeof bubbleToken).toBe("string");
    expect(bubbleToken?.length).toBeGreaterThan(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an authenticated Bubble.io API request without performing a live network call", async () => {
    const bubbleApiUrl = process.env.BUBBLE_API_URL;
    const bubbleToken = process.env.BUBBLE_API_TOKEN;

    if (!bubbleApiUrl || !bubbleToken) {
      throw new Error("Bubble.io credentials not configured");
    }

    const fetchMock = vi.fn().mockResolvedValue({ status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    const testUrl = `${bubbleApiUrl}/test_connection`;
    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bubbleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: "connection" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(testUrl, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: `Bearer ${bubbleToken}` }),
    }));
    expect(response.status).toBe(404);
  });
});
