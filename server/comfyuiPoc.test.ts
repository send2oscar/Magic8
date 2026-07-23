import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQwenWorkflow, ComfyUiPocError, runComfyUIPOC } from "./comfyuiPoc";

const encoder = new TextEncoder();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ComfyUI POC", () => {
  it("replaces only LoadImage node 78 with the ComfyUI-managed input filename", () => {
    const workflow = buildQwenWorkflow("incoming/poc-input.png", "put a blue shirt on the person");

    expect(workflow["78"].inputs.image).toBe("incoming/poc-input.png");
    expect(workflow["119"].inputs.prompt).toBe("put a blue shirt on the person");
    expect(workflow["102"].class_type).toBe("SaveImage");
    expect(workflow["104"]).toBeUndefined();
    expect(workflow["106"]).toBeUndefined();
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

    const result = await runComfyUIPOC(Buffer.from("source-image"), "portrait.png", "put a blue shirt on the person");

    expect(result.success).toBe(true);
    expect(result.promptId).toBe("prompt-123");
    expect(result.outputBuffer.toString()).toBe("image-output");
    expect(result.outputMimeType).toBe("image/png");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/upload/image");

    const submittedPayload = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(submittedPayload.prompt["78"].inputs.image).toBe("incoming/poc-input.png");
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
});
