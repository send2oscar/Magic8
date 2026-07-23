import { describe, expect, it, vi } from "vitest";
import { getComfyUiPocDefaultPrompt } from "./comfyuiPocDefaultPrompt";

describe("ComfyUI POC remote default prompt", () => {
  it("returns a short, permitted remote prompt with no-cache request options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Change the shirt to yellow.\n", { status: 200 }));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({
      available: true,
      prompt: "Change the shirt to yellow.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://www.oscarngan.com/defaultPrompt.txt",
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    );
  });

  it("allows a short non-explicit owner-provided value even when it does not name a garment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("test", { status: 200 }));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({
      available: true,
      prompt: "test",
    });
  });

  it("allows a slow first response that completes after the previous four-second limit", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockImplementation(
        () => new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response("test", { status: 200 })), 4_100);
        }),
      );

      const resultPromise = getComfyUiPocDefaultPrompt(fetchMock as typeof fetch);
      await vi.advanceTimersByTimeAsync(4_100);

      await expect(resultPromise).resolves.toEqual({ available: true, prompt: "test" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not return a remote prompt that requests nudification or clothing removal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Remove the subject\'s clothing.", { status: 200 }));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({ available: true, prompt: "Remove the subject\'s clothing." });
  });

  it("fails closed when the remote text source is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({ available: false, prompt: "" });
  });

  it("fails closed when the remote response exceeds the prompt-size limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("a".repeat(4_097), { status: 200 }));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({ available: false, prompt: "" });
  });
});
