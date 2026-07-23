import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkComfyUiConnection, getApprovedQwenOutput } from "./comfyui";
import { APPROVED_QWEN_CHECKPOINT, createApprovedQwenWorkflow, QWEN_INPUT_NODE_ID, QWEN_PROMPT_NODE_ID } from "./comfyuiQwenWorkflow";
import { ENV } from "./_core/env";

const mocks = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    request: mocks.request,
    get: mocks.get,
  },
}));

function axiosResponse(data: unknown, status = 200) {
  return { status, data: Buffer.from(JSON.stringify(data)), headers: { "content-type": "application/json" } } as never;
}

describe("direct ComfyUI connection", () => {
  const originalUrl = ENV.comfyuiServerUrl;
  const originalToken = ENV.comfyuiApiToken;

  afterEach(() => {
    ENV.comfyuiServerUrl = originalUrl;
    ENV.comfyuiApiToken = originalToken;
    vi.clearAllMocks();
  });

  it("uses the configured HTTP health endpoint without a token when the direct server is public", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    ENV.comfyuiApiToken = "";
    mocks.request.mockResolvedValue(axiosResponse({ system: {} }));

    await checkComfyUiConnection();

    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://oscarngan.ddns.net:8188/system_stats",
      method: "GET",
    }));
    expect(mocks.request.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it("includes a bearer token only when direct ComfyUI authentication is configured", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    ENV.comfyuiApiToken = "test-comfyui-token";
    mocks.request.mockResolvedValue(axiosResponse({ system: {} }));

    await checkComfyUiConnection();

    expect(mocks.request.mock.calls[0][0].headers.authorization).toBe("Bearer test-comfyui-token");
  });

  it("creates the fixed Qwen workflow while forwarding the entered edit prompt unchanged", () => {
    const prompt = "Keep this prompt exactly as entered — no filter, substitution, or preface.";
    const workflow = createApprovedQwenWorkflow("shirt-changer-input.png", prompt);

    expect(workflow[QWEN_INPUT_NODE_ID].inputs.image).toBe("shirt-changer-input.png");
    expect(workflow[QWEN_PROMPT_NODE_ID].inputs.prompt).toContain(prompt);
    expect(workflow["118"].inputs.ckpt_name).toBe(APPROVED_QWEN_CHECKPOINT);
    expect(() => createApprovedQwenWorkflow("../unsafe.png")).toThrow("invalid uploaded filename");
  });

  it("recognizes an explicit direct-ComfyUI execution failure", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    mocks.request.mockResolvedValue(axiosResponse({ task: { status: { status_str: "error" } } }));

    await expect(getApprovedQwenOutput("task")).rejects.toThrow("failed image edit");
  });
});
