import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkComfyUiConnection, getApprovedQwenOutput, getApprovedQwenTaskProgress } from "./comfyui";
import { APPROVED_QWEN_CHECKPOINT, createApprovedQwenWorkflow, QWEN_INPUT_NODE_ID, QWEN_OUTPUT_NODE_ID, QWEN_PROMPT_NODE_ID } from "./comfyuiQwenWorkflow";
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

  it("omits the optional metadata chain that is incompatible with the direct ComfyUI host", () => {
    const workflow = createApprovedQwenWorkflow("shirt-changer-input.png", "Use this exact prompt.");

    expect(workflow[QWEN_OUTPUT_NODE_ID].inputs.metadata).toBeUndefined();
    expect(workflow["104"]).toBeUndefined();
    expect(workflow["106"]).toBeUndefined();
    expect(workflow[QWEN_OUTPUT_NODE_ID].inputs.filename).toBe("shirt_changer_qwen_%time");
  });

  it("recognizes an explicit direct-ComfyUI execution failure", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    mocks.request.mockResolvedValue(axiosResponse({ task: { status: { status_str: "error" } } }));

    await expect(getApprovedQwenOutput("task")).rejects.toThrow("failed image edit");
  });

  it("normalizes a Windows-style ComfyUI output subfolder before Gallery retrieval", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    mocks.request.mockResolvedValue(axiosResponse({
      task: {
        status: { status_str: "success" },
        outputs: {
          [QWEN_OUTPUT_NODE_ID]: {
            images: [{ filename: "shirt_changer_qwen_2026-07-29-134317.jpg", subfolder: "qwen_edit\\2026-07-29", type: "output" }],
          },
        },
      },
    }));

    await expect(getApprovedQwenOutput("task")).resolves.toEqual({
      filename: "shirt_changer_qwen_2026-07-29-134317.jpg",
      subfolder: "qwen_edit/2026-07-29",
      type: "output",
    });
  });

  it("reports the prompt's truthful queued position without inventing a duration estimate", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    mocks.request.mockResolvedValue(axiosResponse({
      queue_running: [[1, "other-running-prompt"]],
      queue_pending: [[2, "other-prompt"], [3, "target-prompt"]],
    }));

    await expect(getApprovedQwenTaskProgress("target-prompt")).resolves.toEqual({
      phase: "queued",
      queueRemaining: 1,
      estimatedSecondsRemaining: null,
    });
  });

  it("reports direct execution when ComfyUI identifies the prompt as running", async () => {
    ENV.comfyuiServerUrl = "http://oscarngan.ddns.net:8188";
    mocks.request.mockResolvedValue(axiosResponse({
      queue_running: [[1, "target-prompt"]],
      queue_pending: [[2, "other-prompt"]],
    }));

    await expect(getApprovedQwenTaskProgress("target-prompt")).resolves.toEqual({
      phase: "executing",
      queueRemaining: 0,
      estimatedSecondsRemaining: null,
    });
  });
});
