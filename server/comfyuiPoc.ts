/**
 * ComfyUI POC Service
 *
 * The web server cannot give a remote ComfyUI instance a path on its own
 * filesystem. The required contract is therefore:
 *   1. Upload bytes to ComfyUI's /upload/image endpoint.
 *   2. Put the returned ComfyUI-managed input filename in LoadImage node 78.
 *   3. Submit the fixed Qwen workflow and retrieve its named output.
 */

import { randomUUID } from "node:crypto";
import {
  APPROVED_QWEN_CHECKPOINT,
  buildSafeQwenEditPrompt,
  QWEN_INPUT_NODE_ID,
  QWEN_OUTPUT_NODE_ID,
  QWEN_PROMPT_NODE_ID,
} from "./comfyuiQwenWorkflow";

const COMFYUI_URL = "http://oscarngan.ddns.net:8188";
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type ComfyUiPocDiagnostic = {
  key: "upload" | "submission" | "queued" | "polling" | "output" | "download" | "failed";
  label: string;
  detail?: string;
};

export class ComfyUiPocError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: ComfyUiPocDiagnostic[],
  ) {
    super(message);
    this.name = "ComfyUiPocError";
  }
}

type ComfyUiUploadResponse = {
  name?: string;
  subfolder?: string;
  type?: string;
};

type ComfyUiPromptResponse = {
  prompt_id?: string;
  error?: unknown;
  node_errors?: Record<string, unknown>;
};

type ComfyUiOutputImage = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

type ComfyUiHistoryItem = {
  outputs?: Record<string, unknown>;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
};

type UploadedComfyUiImage = {
  inputFilename: string;
  type: string;
};

export type ComfyUiPocResult = {
  success: true;
  promptId: string;
  outputBuffer: Buffer;
  outputMimeType: "image/jpeg" | "image/png" | "image/webp";
  diagnostics: ComfyUiPocDiagnostic[];
  message: string;
};

export type ComfyUiPocProgressUpdate = {
  phase: "connecting" | "queued" | "executing" | "completed" | "unavailable";
  label: string;
  progressValue?: number | null;
  progressMax?: number | null;
  percent?: number | null;
  estimatedSecondsRemaining?: number | null;
  queueRemaining?: number | null;
};

type ComfyUiPocRunOptions = {
  clientId?: string;
  onProgress?: (update: ComfyUiPocProgressUpdate) => void;
};

function diagnostic(
  diagnostics: ComfyUiPocDiagnostic[],
  key: ComfyUiPocDiagnostic["key"],
  label: string,
  detail?: string,
) {
  diagnostics.push({ key, label, ...(detail ? { detail } : {}) });
  console.info("[ComfyUI POC]", label, detail ? { detail } : "");
}

function imageMimeType(filename: string): "image/jpeg" | "image/png" | "image/webp" {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function outputMimeType(contentType: string | null): "image/jpeg" | "image/png" | "image/webp" {
  const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/webp") return "image/webp";
  return "image/jpeg";
}

function generatedInputFilename(originalFilename: string) {
  const extension = originalFilename.split(".").pop()?.toLowerCase();
  const safeExtension = extension === "png" || extension === "webp" || extension === "jpeg" || extension === "jpg"
    ? extension === "jpeg" ? "jpg" : extension
    : "jpg";
  return `shirt-changer-poc-${Date.now()}-${randomUUID()}.${safeExtension}`;
}

function getValidationMessage(payload: ComfyUiPromptResponse): string {
  const nodeErrors = payload.node_errors;
  if (!nodeErrors || !Object.keys(nodeErrors).length) {
    return "ComfyUI rejected the fixed workflow before it entered the queue.";
  }

  const [nodeId, rawNodeError] = Object.entries(nodeErrors)[0] ?? [];
  const nodeError = rawNodeError as {
    errors?: Array<{ extra_info?: { input_name?: string }; details?: string }>;
  };
  const firstError = nodeError?.errors?.[0];
  const inputName = firstError?.extra_info?.input_name;
  const rawDetail = firstError?.details?.toLowerCase() ?? "";

  if (nodeId === QWEN_INPUT_NODE_ID || rawDetail.includes("invalid image file")) {
    return "ComfyUI could not validate the uploaded input image. The POC must use the filename returned by ComfyUI's upload endpoint.";
  }

  return `ComfyUI rejected the fixed workflow at node ${nodeId ?? "unknown"}${inputName ? ` (${inputName})` : ""}.`;
}

function getExecutionFailureMessage(messages: unknown[] | undefined): string {
  for (const message of messages ?? []) {
    if (!Array.isArray(message)) continue;
    const kind = typeof message[0] === "string" ? message[0] : "";
    const details = message[1] as { node_id?: unknown; node_type?: unknown } | undefined;
    if (kind === "execution_error" || kind === "execution_interrupted") {
      const nodeId = typeof details?.node_id === "string" || typeof details?.node_id === "number"
        ? String(details.node_id)
        : "an unknown";
      const nodeType = typeof details?.node_type === "string" ? ` (${details.node_type})` : "";
      return `ComfyUI stopped while executing node ${nodeId}${nodeType}.`;
    }
  }
  return "The remote ComfyUI workflow finished without a successful result.";
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const POC_NODE_LABELS: Record<string, string> = {
  [QWEN_INPUT_NODE_ID]: "Loading the uploaded source image.",
  "93": "Preparing the source image for the Qwen workflow.",
  "103": "Preparing the Qwen model configuration.",
  "77": "Preparing the negative edit guidance.",
  [QWEN_PROMPT_NODE_ID]: "Preparing the shirt-edit guidance.",
  "88": "Encoding the source image.",
  "121": "Generating the edited image.",
  "8": "Decoding the generated image.",
  [QWEN_OUTPUT_NODE_ID]: "Saving the edited result.",
};

class ComfyUiProgressTracker {
  private socket: WebSocket | null = null;
  private promptId: string | null = null;
  private firstSamplerProgressAt: number | null = null;
  private receivedTerminalEvent = false;

  constructor(
    private readonly clientId: string,
    private readonly onProgress: (update: ComfyUiPocProgressUpdate) => void,
  ) {}

  async connect() {
    this.onProgress({ phase: "connecting", label: "Connecting to ComfyUI for live task progress." });
    try {
      const socket = new WebSocket(`${COMFYUI_URL.replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(this.clientId)}`);
      this.socket = socket;
      socket.addEventListener("message", (event) => this.handleMessage(event.data));
      socket.addEventListener("close", () => {
        if (!this.receivedTerminalEvent && this.promptId) {
          this.onProgress({ phase: "unavailable", label: "Live ComfyUI progress is unavailable; processing will continue." });
        }
      });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out while opening ComfyUI live progress.")), 15_000);
        socket.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("ComfyUI live progress connection failed."));
        }, { once: true });
      });
    } catch (error) {
      console.warn("[ComfyUI POC] Live progress connection unavailable", error);
      this.onProgress({ phase: "unavailable", label: "Live ComfyUI progress is unavailable; processing will continue." });
      this.close();
    }
  }

  setPromptId(promptId: string) {
    this.promptId = promptId;
    this.onProgress({ phase: "queued", label: "ComfyUI accepted the edit and added it to its queue." });
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  private handleMessage(rawData: unknown) {
    if (typeof rawData !== "string") return;
    try {
      const message = JSON.parse(rawData) as { type?: unknown; data?: unknown };
      if (!isRecord(message) || typeof message.type !== "string" || !isRecord(message.data)) return;
      const data = message.data;
      const eventPromptId = typeof data.prompt_id === "string" ? data.prompt_id : null;

      if (message.type === "status") {
        const status = isRecord(data.status) ? data.status : null;
        const execInfo = status && isRecord(status.exec_info) ? status.exec_info : null;
        const queueRemaining = numericValue(execInfo?.queue_remaining);
        if (this.promptId && queueRemaining !== null) {
          this.onProgress({
            phase: "queued",
            label: `ComfyUI reports ${queueRemaining} queued job${queueRemaining === 1 ? "" : "s"} remaining.`,
            queueRemaining,
          });
        }
        return;
      }

      if (!this.promptId || eventPromptId !== this.promptId) return;

      if (message.type === "executing") {
        const node = typeof data.node === "string" || typeof data.node === "number" ? String(data.node) : null;
        if (!node) return;
        this.onProgress({
          phase: "executing",
          label: POC_NODE_LABELS[node] ?? "ComfyUI is processing the edit workflow.",
          progressValue: null,
          progressMax: null,
          percent: null,
          estimatedSecondsRemaining: null,
        });
        return;
      }

      if (message.type === "progress") {
        const value = numericValue(data.value);
        const max = numericValue(data.max);
        if (value === null || max === null || max <= 0) return;
        if (this.firstSamplerProgressAt === null) this.firstSamplerProgressAt = Date.now();
        const percent = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
        const elapsedMs = Date.now() - this.firstSamplerProgressAt;
        const estimatedSecondsRemaining = value > 0 && value < max
          ? Math.max(1, Math.ceil((elapsedMs / value) * (max - value) / 1_000))
          : 0;
        this.onProgress({
          phase: "executing",
          label: `Generating the edited image: ${value} of ${max} sampler steps complete.`,
          progressValue: value,
          progressMax: max,
          percent,
          estimatedSecondsRemaining,
        });
        return;
      }

      if (message.type === "progress_state") {
        const nodes = isRecord(data.nodes) ? data.nodes : null;
        if (!nodes) return;
        const runningNode = Object.entries(nodes).find(([, state]) => isRecord(state) && state.state === "running");
        if (!runningNode) return;
        const [nodeId, rawState] = runningNode;
        const state = rawState as Record<string, unknown>;
        const value = numericValue(state.value);
        const max = numericValue(state.max);
        const isSampler = nodeId === "121";
        if (isSampler && value !== null && max !== null && max > 0) {
          if (this.firstSamplerProgressAt === null) this.firstSamplerProgressAt = Date.now();
          const percent = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
          const elapsedMs = Date.now() - this.firstSamplerProgressAt;
          const estimatedSecondsRemaining = value > 0 && value < max
            ? Math.max(1, Math.ceil((elapsedMs / value) * (max - value) / 1_000))
            : 0;
          this.onProgress({
            phase: "executing",
            label: `Generating the edited image: ${value} of ${max} sampler steps complete.`,
            progressValue: value,
            progressMax: max,
            percent,
            estimatedSecondsRemaining,
          });
          return;
        }

        this.onProgress({
          phase: "executing",
          label: POC_NODE_LABELS[nodeId] ?? "ComfyUI is processing the edit workflow.",
          progressValue: value,
          progressMax: max,
          percent: null,
          estimatedSecondsRemaining: null,
        });
        return;
      }

      if (message.type === "execution_success") {
        this.receivedTerminalEvent = true;
        this.onProgress({ phase: "completed", label: "ComfyUI completed the edit; retrieving the result image." });
      }
    } catch {
      // Unexpected remote payloads are deliberately ignored rather than exposed to the browser.
    }
  }
}

/**
 * Fixed API-format QwenImageEditRapidv1.0(External) workflow.
 * Only the approved LoadImage node and positive editing prompt are replaced at runtime.
 */
export function buildQwenWorkflow(imageFilename: string, positivePrompt = ""): Record<string, any> {
  const safePositivePrompt = buildSafeQwenEditPrompt(positivePrompt);
  const workflow: Record<string, any> = {
    "8": { inputs: { samples: ["121", 1], vae: ["118", 2] }, class_type: "VAEDecode" },
    "66": { inputs: { shift: 3, model: ["103", 0] }, class_type: "ModelSamplingAuraFlow" },
    "75": { inputs: { strength: 1, pre_cfg: false, model: ["66", 0] }, class_type: "CFGNorm" },
    "77": {
      inputs: {
        prompt: "ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal",
        clip: ["103", 1],
        vae: ["118", 2],
        image: [QWEN_INPUT_NODE_ID, 0],
      },
      class_type: "TextEncodeQwenImageEdit",
    },
    [QWEN_INPUT_NODE_ID]: { inputs: { image: imageFilename }, class_type: "LoadImage" },
    "88": { inputs: { pixels: ["93", 0], vae: ["118", 2] }, class_type: "VAEEncode" },
    "93": {
      inputs: { upscale_method: "lanczos", megapixels: 1, resolution_steps: 1, image: [QWEN_INPUT_NODE_ID, 0] },
      class_type: "ImageScaleToTotalPixels",
    },
    // The imported template's Image Saver Simple metadata chain expects a
    // GUI-only extra_pnginfo.workflow document. SaveImage is API-compatible.
    [QWEN_OUTPUT_NODE_ID]: { inputs: { filename_prefix: "shirt-changer-poc", images: ["8", 0] }, class_type: "SaveImage" },
    "103": {
      inputs: {
        PowerLoraLoaderHeaderWidget: { type: "PowerLoraLoaderHeaderWidget" },
        "➕ Add Lora": "",
        model: ["118", 0],
        clip: ["118", 1],
      },
      class_type: "Power Lora Loader (rgthree)",
    },
    "115": { inputs: { value: 8 }, class_type: "INTConstant" },
    "117": { inputs: { value: 0 }, class_type: "PrimitiveInt" },
    "118": { inputs: { ckpt_name: APPROVED_QWEN_CHECKPOINT }, class_type: "CheckpointLoaderSimple" },
    [QWEN_PROMPT_NODE_ID]: {
      inputs: { prompt: safePositivePrompt, clip: ["103", 1], vae: ["118", 2], image1: [QWEN_INPUT_NODE_ID, 0] },
      class_type: "TextEncodeQwenImageEditPlus",
    },
    "121": {
      inputs: {
        eta: 0.5, sampler_name: "linear/euler", scheduler: "simple", steps: ["115", 0], steps_to_run: -1,
        denoise: 1, cfg: 1, seed: ["117", 0], sampler_mode: "standard", bongmath: true,
        model: ["75", 0], positive: [QWEN_PROMPT_NODE_ID, 0], negative: ["77", 0], latent_image: ["88", 0],
      },
      class_type: "ClownsharKSampler_Beta",
    },
  };

  return workflow;
}

export async function uploadImageToComfyUI(
  imageBuffer: Buffer,
  imageName: string,
  diagnostics: ComfyUiPocDiagnostic[],
): Promise<UploadedComfyUiImage> {
  if (!imageBuffer.length) {
    throw new ComfyUiPocError("The selected image is empty.", diagnostics);
  }
  if (imageBuffer.length > MAX_INPUT_BYTES) {
    throw new ComfyUiPocError("The selected image exceeds the 25 MB POC limit.", diagnostics);
  }

  const remoteFilename = generatedInputFilename(imageName);
  const mimeType = imageMimeType(remoteFilename);
  // Send a sized multipart body rather than a chunked FormData stream. This is
  // more compatible with the remote ComfyUI Desktop/AioHTTP upload endpoint.
  const boundary = `----shirtChangerPoc${randomUUID().replaceAll("-", "")}`;
  const multipartPrefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${remoteFilename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const multipartSuffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const multipartBody = Buffer.concat([multipartPrefix, imageBuffer, multipartSuffix]);

  diagnostic(diagnostics, "upload", "Uploading the source image to the remote ComfyUI input directory.");
  let response: Response;
  try {
    response = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(multipartBody.length),
      },
      body: multipartBody,
    });
  } catch (error) {
    console.error("[ComfyUI POC] Image upload request failed", error);
    diagnostic(diagnostics, "failed", "The application server could not reach ComfyUI's image-upload endpoint.");
    throw new ComfyUiPocError("The application server could not upload the source image to ComfyUI.", diagnostics);
  }
  const payload = await readJson<ComfyUiUploadResponse>(response);

  if (!response.ok || !payload?.name) {
    diagnostic(diagnostics, "failed", "The remote ComfyUI instance rejected the source-image upload.", `HTTP ${response.status}`);
    throw new ComfyUiPocError("ComfyUI could not accept the uploaded image.", diagnostics);
  }

  const inputFilename = [payload.subfolder, payload.name].filter(Boolean).join("/");
  diagnostic(diagnostics, "upload", "ComfyUI stored the source image and returned an input filename.");
  return { inputFilename, type: payload.type || "input" };
}

export async function submitComfyUIWorkflow(
  workflow: Record<string, any>,
  diagnostics: ComfyUiPocDiagnostic[],
  clientId?: string,
): Promise<{ promptId: string }> {
  diagnostic(diagnostics, "submission", "Submitting the fixed Qwen workflow to ComfyUI for validation.");
  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, ...(clientId ? { client_id: clientId } : {}) }),
  });
  const payload = await readJson<ComfyUiPromptResponse>(response);

  if (!response.ok || !payload?.prompt_id) {
    const message = payload ? getValidationMessage(payload) : "ComfyUI returned an unreadable validation response.";
    diagnostic(diagnostics, "failed", message, `HTTP ${response.status}`);
    throw new ComfyUiPocError(message, diagnostics);
  }

  diagnostic(diagnostics, "queued", "ComfyUI validated the workflow and queued the edit request.");
  return { promptId: payload.prompt_id };
}

export async function pollComfyUIResult(
  promptId: string,
  diagnostics: ComfyUiPocDiagnostic[],
  maxWaitTime = 160_000,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let loggedPolling = false;

  while (Date.now() - startedAt < maxWaitTime) {
    const response = await fetch(`${COMFYUI_URL}/history/${encodeURIComponent(promptId)}`);
    if (response.ok) {
      const history = await readJson<Record<string, ComfyUiHistoryItem>>(response);
      const item = history?.[promptId];
      if (item) {
        const status = item.status?.status_str;
        if (status && status !== "success") {
          const message = getExecutionFailureMessage(item.status?.messages);
          diagnostic(diagnostics, "failed", message);
          throw new ComfyUiPocError(message, diagnostics);
        }
        diagnostic(diagnostics, "output", "ComfyUI completed the workflow and reported its output nodes.");
        return item.outputs ?? {};
      }
    }

    if (!loggedPolling) {
      diagnostic(diagnostics, "polling", "Waiting for the remote ComfyUI worker to finish the Qwen edit.");
      loggedPolling = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  diagnostic(diagnostics, "failed", "The ComfyUI POC did not finish within the 160-second request window.");
  throw new ComfyUiPocError("ComfyUI processing timed out. Please retry after confirming the workstation is idle.", diagnostics);
}

function findOutputImage(outputs: Record<string, unknown>): ComfyUiOutputImage | null {
  const nodeOutput = outputs[QWEN_OUTPUT_NODE_ID];
  if (!nodeOutput || typeof nodeOutput !== "object") return null;
  const images = (nodeOutput as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  const first = images[0] as ComfyUiOutputImage | undefined;
  return first?.filename ? first : null;
}

export async function downloadComfyUIOutput(
  image: ComfyUiOutputImage,
  diagnostics: ComfyUiPocDiagnostic[],
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" }> {
  const query = new URLSearchParams({ filename: image.filename ?? "", type: image.type || "output" });
  if (image.subfolder) query.set("subfolder", image.subfolder);

  diagnostic(diagnostics, "download", "Downloading the named result image from ComfyUI.");
  const response = await fetch(`${COMFYUI_URL}/view?${query.toString()}`);
  if (!response.ok) {
    diagnostic(diagnostics, "failed", "ComfyUI completed the workflow, but the named output image could not be downloaded.", `HTTP ${response.status}`);
    throw new ComfyUiPocError("ComfyUI output retrieval failed.", diagnostics);
  }

  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: outputMimeType(response.headers.get("content-type")) };
}

export async function runComfyUIPOC(
  imageBuffer: Buffer,
  imageName: string,
  positivePrompt = "",
  options: ComfyUiPocRunOptions = {},
): Promise<ComfyUiPocResult> {
  const diagnostics: ComfyUiPocDiagnostic[] = [];
  const tracker = options.clientId && options.onProgress
    ? new ComfyUiProgressTracker(options.clientId, options.onProgress)
    : null;

  try {
    // Validate and normalize before creating a socket or uploading bytes so an
    // unsafe prompt can never cause traffic to the owner-controlled service.
    buildSafeQwenEditPrompt(positivePrompt);
    await tracker?.connect();
    const uploadedImage = await uploadImageToComfyUI(imageBuffer, imageName, diagnostics);
    const workflow = buildQwenWorkflow(uploadedImage.inputFilename, positivePrompt);
    const { promptId } = await submitComfyUIWorkflow(workflow, diagnostics, options.clientId);
    tracker?.setPromptId(promptId);
    const outputs = await pollComfyUIResult(promptId, diagnostics);
    const outputImage = findOutputImage(outputs);

    if (!outputImage) {
      diagnostic(diagnostics, "failed", "The workflow completed but did not report an image output.");
      throw new ComfyUiPocError("ComfyUI did not return a downloadable output image.", diagnostics);
    }

    const output = await downloadComfyUIOutput(outputImage, diagnostics);
    diagnostic(diagnostics, "output", "The edited image was retrieved successfully.");
    return {
      success: true,
      promptId,
      outputBuffer: output.buffer,
      outputMimeType: output.mimeType,
      diagnostics,
      message: "ComfyUI completed the POC image edit.",
    };
  } catch (error) {
    if (error instanceof ComfyUiPocError) throw error;
    diagnostic(diagnostics, "failed", "The server could not complete the ComfyUI POC request.");
    throw new ComfyUiPocError("The ComfyUI POC request could not be completed.", diagnostics);
  } finally {
    tracker?.close();
  }
}
