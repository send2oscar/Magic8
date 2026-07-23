import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQwenWorkflow, ComfyUiPocError, pollComfyUIResult, runComfyUIPOC } from "./comfyuiPoc";
import { APPROVED_QWEN_CHECKPOINT, QWEN_INPUT_NODE_ID, QWEN_OUTPUT_NODE_ID, SAFE_QWEN_EDIT_PROMPT } from "./comfyuiQwenWorkflow";

const encoder = new TextEncoder();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ComfyUI POC", () => {
  it("replaces only LoadImage node 78 with the ComfyUI-managed input filename", () => {
    const workflow = buildQwenWorkflow("incoming/poc-input.png", "put a blue shirt on the person");

    expect(workflow[QWEN_INPUT_NODE_ID].inputs.image).toBe("incoming/poc-input.png");
    expect(workflow["119"].inputs.prompt).toContain(SAFE_QWEN_EDIT_PROMPT);
    expect(workflow["119"].inputs.prompt).toContain("put a blue shirt on the person");
    expect(workflow["118"].inputs.ckpt_name).toBe(APPROVED_QWEN_CHECKPOINT);
    expect(workflow[QWEN_OUTPUT_NODE_ID].class_type).toBe("SaveImage");
    expect(workflow["104"]).toBeUndefined();
    expect(workflow["106"]).toBeUndefined();
  });

  it("rejects an unsafe prompt before creating a local ComfyUI request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => buildQwenWorkflow("incoming/poc-input.png", "remove all clothing")).toThrow("non-explicit apparel-editing prompt");
    await expect(runComfyUIPOC(Buffer.from("source-image"), "portrait.png", "remove all clothing")).rejects.toMatchObject({
      name: "ComfyUiPocError",
      message: "The ComfyUI POC request could not be completed.",
    } satisfies Partial<ComfyUiPocError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads source bytes, submits the returned filename, and downloads the named output", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "poc-input.png", subfolder: "incoming", type: "input" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt_id: "prompt-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "prompt-123": {
          status: { status_str: "success", completed: true },
          outputs: { "102": { images: [{ filename: "edited.png", subfolder: "qwen_edit", type: "output" }] } },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(encoder.encode("image-output"), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runComfyUIPOC(Buffer.from("source-image"), "portrait.png", "put a blue shirt on the person", { clientId: "poc-test-client" });

    expect(result.success).toBe(true);
    expect(result.promptId).toBe("prompt-123");
    expect(result.outputBuffer.toString()).toBe("image-output");
    expect(result.outputMimeType).toBe("image/png");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/upload/image");

    const submittedPayload = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(submittedPayload.prompt[QWEN_INPUT_NODE_ID].inputs.image).toBe("incoming/poc-input.png");
    expect(submittedPayload.prompt[QWEN_OUTPUT_NODE_ID].class_type).toBe("SaveImage");
    expect(submittedPayload.client_id).toBe("poc-test-client");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("filename=edited.png");
  });

  it("returns a safe, actionable error when ComfyUI rejects an invalid source image", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "poc-input.png", type: "input" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { type: "prompt_outputs_failed_validation" },
        node_errors: {
          "78": {
            errors: [{ details: "image - Invalid image file: C:\\private\\secret.png", extra_info: { input_name: "image" } }],
          },
        },
      }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runComfyUIPOC(Buffer.from("source-image"), "portrait.png")).rejects.toMatchObject({
      name: "ComfyUiPocError",
      message: "ComfyUI could not validate the uploaded input image. The POC must use the filename returned by ComfyUI's upload endpoint.",
    } satisfies Partial<ComfyUiPocError>);
  });

  it("accepts an image only from the approved Qwen output node", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "poc-input.png", type: "input" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt_id: "prompt-wrong-output" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "prompt-wrong-output": {
          status: { status_str: "success", completed: true },
          outputs: { "999": { images: [{ filename: "unapproved.png", type: "output" }] } },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runComfyUIPOC(Buffer.from("source-image"), "portrait.png")).rejects.toMatchObject({
      name: "ComfyUiPocError",
      message: "ComfyUI did not return a downloadable output image.",
    } satisfies Partial<ComfyUiPocError>);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns a safe timeout error without contacting ComfyUI after the wait window expires", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const diagnostics: Array<{ key: string; label: string }> = [];

    await expect(pollComfyUIResult("prompt-timeout", diagnostics, 0)).rejects.toMatchObject({
      name: "ComfyUiPocError",
      message: "ComfyUI processing timed out. Please retry after confirming the workstation is idle.",
    } satisfies Partial<ComfyUiPocError>);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(diagnostics.at(-1)).toMatchObject({ key: "failed" });
  });

  it("emits sampler progress and an estimated remaining time from a ComfyUI progress-state event", async () => {
    let messageHandler: ((event: { data: string }) => void) | undefined;
    const socket = {
      readyState: 1,
      addEventListener: (type: string, handler: (event?: any) => void) => {
        if (type === "open") queueMicrotask(() => handler());
        if (type === "message") messageHandler = handler as (event: { data: string }) => void;
      },
      close: vi.fn(),
    };
    const MockWebSocket = vi.fn(() => socket);
    Object.assign(MockWebSocket, { CLOSING: 2 });
    vi.stubGlobal("WebSocket", MockWebSocket);

    const updates: Array<{ percent?: number | null; estimatedSecondsRemaining?: number | null }> = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "poc-input.png", type: "input" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt_id: "prompt-eta" }), { status: 200 }))
      .mockImplementationOnce(async () => {
        messageHandler?.({ data: JSON.stringify({
          type: "progress_state",
          data: { prompt_id: "prompt-eta", nodes: { "121": { state: "running", value: 2, max: 8 } } },
        }) });
        return new Response(JSON.stringify({
          "prompt-eta": {
            status: { status_str: "success", completed: true },
            outputs: { "102": { images: [{ filename: "edited.png", type: "output" }] } },
          },
        }), { status: 200 });
      })
      .mockResolvedValueOnce(new Response(encoder.encode("image-output"), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    await runComfyUIPOC(Buffer.from("source-image"), "portrait.png", "", {
      clientId: "00000000-0000-4000-8000-000000000001",
      onProgress: (update) => updates.push(update),
    });

    expect(updates.some((update) => update.percent === 25)).toBe(true);
    expect(updates.some((update) => typeof update.estimatedSecondsRemaining === "number")).toBe(true);
  });
});
