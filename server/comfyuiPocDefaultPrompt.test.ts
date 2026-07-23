import { describe, expect, it, vi } from "vitest";
import { getComfyUiPocDefaultPrompt } from "./comfyuiPocDefaultPrompt";

describe("ComfyUI POC remote default prompt", () => {
  it("returns a short, permitted apparel-editing prompt with no-cache request options", async () => {
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

  it("does not return a remote prompt that requests nudification or clothing removal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Remove the subject's clothing.", { status: 200 }));

    await expect(getComfyUiPocDefaultPrompt(fetchMock as typeof fetch)).resolves.toEqual({ available: false, prompt: "" });
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
