import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("server/storage", () => ({ storagePut: mocks.storagePut }));
vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.test/",
    forgeApiKey: "test-key",
  },
}));

import { generateImage } from "./_core/imageGeneration";

describe("generateImage without an application abort timer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("waits for the upstream response and does not attach an abort signal", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.storagePut.mockResolvedValue({ key: "generated/result.png", url: "/manus-storage/generated/result.png" });

    const generation = generateImage({ prompt: "change the shirt" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();

    resolveResponse({
      ok: true,
      json: async () => ({ image: { b64Json: Buffer.from("result").toString("base64"), mimeType: "image/png" } }),
    } as Response);

    await expect(generation).resolves.toEqual({ url: "/manus-storage/generated/result.png" });
    expect(mocks.storagePut).toHaveBeenCalledOnce();
  });

  it("retries a rejected high-quality edit once at medium quality without exposing upstream details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "upstream detail" } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: { b64Json: Buffer.from("result").toString("base64"), mimeType: "image/png" } }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    mocks.storagePut.mockResolvedValue({ key: "generated/result.png", url: "/manus-storage/generated/result.png" });
    const onRetry = vi.fn();

    await expect(generateImage({
      prompt: "change the shirt",
      quality: "high",
      originalImages: [{ b64Json: "c291cmNl", mimeType: "image/jpeg" }],
      onRetry,
    })).resolves.toEqual({ url: "/manus-storage/generated/result.png" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ quality: "high" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ quality: "medium" });
    expect(onRetry).toHaveBeenCalledWith({ fromQuality: "high", toQuality: "medium", status: 422 });
  });
});
