import { afterEach, describe, expect, it, vi } from "vitest";

const storagePut = vi.fn();

vi.mock("./storage", () => ({ storagePut }));
vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.test/",
    forgeApiKey: "test-key",
  },
}));

import { generateImage } from "./_core/imageGeneration";

describe("generateImage timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("aborts an upstream image request and does not store a result after the configured timeout", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage({ prompt: "change the shirt", timeoutMs: 5 })).rejects.toThrow(
      "Image generation timed out after 0 seconds.",
    );
    expect(storagePut).not.toHaveBeenCalled();
  });
});
