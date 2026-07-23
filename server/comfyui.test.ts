import { afterEach, describe, expect, it, vi } from "vitest";
import { checkComfyUiConnection, getApprovedQwenOutput } from "./comfyui";
import { APPROVED_QWEN_CHECKPOINT, createApprovedQwenWorkflow, QWEN_INPUT_NODE_ID, QWEN_PROMPT_NODE_ID, SAFE_QWEN_EDIT_PROMPT } from "./comfyuiQwenWorkflow";
import { ENV } from "./_core/env";

describe("approved ComfyUI connection", () => {
  const originalUrl = ENV.comfyuiServerUrl;
  const originalToken = ENV.comfyuiApiToken;

  afterEach(() => {
    ENV.comfyuiServerUrl = originalUrl;
    ENV.comfyuiApiToken = originalToken;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls the lightweight health endpoint with the configured bearer token", async () => {
    ENV.comfyuiServerUrl = "https://comfyui.example.test";
    ENV.comfyuiApiToken = "test-comfyui-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ system: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await checkComfyUiConnection();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://comfyui.example.test/system_stats"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-comfyui-token");
  });

  it("rejects a non-HTTPS ComfyUI endpoint before sending any credential", async () => {
    ENV.comfyuiServerUrl = "http://comfyui.example.test:8188";
    ENV.comfyuiApiToken = "test-comfyui-token";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkComfyUiConnection()).rejects.toThrow("must use HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a server-controlled workflow with a fixed checkpoint and safe apparel-edit baseline", () => {
    const workflow = createApprovedQwenWorkflow("shirt-changer-input.png", "make the shirt blue");

    expect(workflow[QWEN_INPUT_NODE_ID].inputs.image).toBe("shirt-changer-input.png");
    expect(workflow[QWEN_PROMPT_NODE_ID].inputs.prompt).toContain(SAFE_QWEN_EDIT_PROMPT);
    expect(workflow[QWEN_PROMPT_NODE_ID].inputs.prompt).toContain("make the shirt blue");
    expect(workflow["118"].inputs.ckpt_name).toBe(APPROVED_QWEN_CHECKPOINT);
    expect(() => createApprovedQwenWorkflow("../unsafe.png")).toThrow("invalid uploaded filename");
    expect(() => createApprovedQwenWorkflow("shirt-changer-input.png", "remove all clothing")).toThrow("non-explicit apparel-editing prompt");
  });

  it("recognizes an explicit ComfyUI execution failure without exposing remote diagnostics", async () => {
    ENV.comfyuiServerUrl = "https://comfyui.example.test";
    ENV.comfyuiApiToken = "test-comfyui-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      task: { status: { status_str: "error" } },
    }), { status: 200 })));

    await expect(getApprovedQwenOutput("task")).rejects.toThrow("failed image edit");
  });
});
