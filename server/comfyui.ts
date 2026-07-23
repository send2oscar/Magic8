import { ENV } from "./_core/env";
import { storageGetSignedUrl } from "./storage";
import { createApprovedQwenWorkflow, QWEN_OUTPUT_NODE_ID } from "./comfyuiQwenWorkflow";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_RESULT_BYTES = 15 * 1024 * 1024;

export class ComfyUiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyUiConfigurationError";
  }
}

export class ComfyUiRemoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyUiRemoteError";
  }
}

type ComfyUiConfig = { baseUrl: URL; token: string };

function getComfyUiConfig(): ComfyUiConfig {
  if (!ENV.comfyuiServerUrl) {
    throw new ComfyUiConfigurationError("ComfyUI is not configured for this website.");
  }
  if (!ENV.comfyuiApiToken) {
    throw new ComfyUiConfigurationError("ComfyUI authentication is not configured for this website.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(ENV.comfyuiServerUrl);
  } catch {
    throw new ComfyUiConfigurationError("The ComfyUI endpoint URL is invalid.");
  }

  if (baseUrl.protocol !== "https:") {
    throw new ComfyUiConfigurationError("The ComfyUI endpoint must use HTTPS.");
  }

  return { baseUrl, token: ENV.comfyuiApiToken };
}

function apiUrl(path: string, search?: URLSearchParams): URL {
  const { baseUrl } = getComfyUiConfig();
  const normalizedBase = baseUrl.toString().replace(/\/+$/, "") + "/";
  const url = new URL(path.replace(/^\/+/, ""), normalizedBase);
  if (search) url.search = search.toString();
  return url;
}

async function comfyFetch(path: string, init: RequestInit = {}, search?: URLSearchParams): Promise<Response> {
  const { token } = getComfyUiConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(apiUrl(path, search), { ...init, headers, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new ComfyUiRemoteError(`ComfyUI returned HTTP ${response.status}.`);
  }
  try {
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ComfyUiRemoteError) throw error;
    throw new ComfyUiRemoteError("ComfyUI returned an invalid JSON response.");
  }
}

function extensionFor(contentType: string, fallbackKey: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  const extension = fallbackKey.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,5}$/.test(extension) ? extension : "jpg";
}

function imageContentType(contentType: string | null, fallbackKey: string): string {
  if (contentType?.startsWith("image/")) return contentType.split(";")[0];
  return `image/${extensionFor("", fallbackKey) === "jpg" ? "jpeg" : extensionFor("", fallbackKey)}`;
}

function safeOutputPart(value: unknown, fieldName: string, allowSlash = false): string {
  if (typeof value !== "string" || !value || value.includes("..")) {
    throw new ComfyUiRemoteError(`ComfyUI returned an invalid ${fieldName}.`);
  }
  const pattern = allowSlash ? /^[A-Za-z0-9._/-]+$/ : /^[A-Za-z0-9._-]+$/;
  if (!pattern.test(value)) throw new ComfyUiRemoteError(`ComfyUI returned an invalid ${fieldName}.`);
  return value;
}

export type ComfyUiPrompt = { promptId: string; uploadedFilename: string };
export type ComfyUiOutput = { filename: string; subfolder: string; type: string };

/** Validates token-bearing connectivity without exposing browser clients to ComfyUI. */
export async function checkComfyUiConnection(): Promise<void> {
  const response = await comfyFetch("/system_stats");
  await readJson(response);
}

async function uploadSourceImage(photoKey: string): Promise<string> {
  const signedSourceUrl = await storageGetSignedUrl(photoKey);
  const sourceResponse = await fetch(signedSourceUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!sourceResponse.ok) throw new ComfyUiRemoteError("The selected source image could not be read from storage.");

  const sourceBytes = await sourceResponse.arrayBuffer();
  if (!sourceBytes.byteLength || sourceBytes.byteLength > MAX_SOURCE_BYTES) {
    throw new ComfyUiRemoteError("The selected source image is too large for ComfyUI processing.");
  }

  const sourceContentType = imageContentType(sourceResponse.headers.get("content-type"), photoKey);
  const uploadFilename = `shirt-changer-${crypto.randomUUID()}.${extensionFor(sourceContentType, photoKey)}`;
  const form = new FormData();
  form.set("image", new Blob([sourceBytes], { type: sourceContentType }), uploadFilename);
  form.set("overwrite", "false");

  const uploaded = await readJson(await comfyFetch("/upload/image", { method: "POST", body: form }));
  return safeOutputPart(uploaded.name ?? uploaded.filename, "uploaded filename");
}

/** Uploads a user-owned S3 photo and queues only the approved XXX Qwen workflow. */
export async function submitApprovedQwenEdit(photoKey: string): Promise<ComfyUiPrompt> {
  const uploadedFilename = await uploadSourceImage(photoKey);
  const promptResponse = await readJson(await comfyFetch("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: createApprovedQwenWorkflow(uploadedFilename), client_id: crypto.randomUUID() }),
  }));
  const promptId = safeOutputPart(promptResponse.prompt_id, "prompt identifier");
  return { promptId, uploadedFilename };
}

/** Returns null while the task is still queued or running. */
export async function getApprovedQwenOutput(promptId: string): Promise<ComfyUiOutput | null> {
  const response = await comfyFetch(`/history/${encodeURIComponent(promptId)}`);
  if (response.status === 404) return null;
  const history = await readJson(response);
  const task = history[promptId];
  if (!task || typeof task !== "object") return null;

  const executionStatus = (task as { status?: unknown }).status;
  if (
    typeof executionStatus === "object" && executionStatus !== null &&
    (executionStatus as { status_str?: unknown }).status_str === "error"
  ) {
    throw new ComfyUiRemoteError("The Qwen workstation reported a failed image edit.");
  }

  const outputs = (task as { outputs?: unknown }).outputs;
  if (!outputs || typeof outputs !== "object") return null;
  const outputNode = (outputs as Record<string, unknown>)[QWEN_OUTPUT_NODE_ID];
  const image = (outputNode as { images?: unknown } | undefined)?.images;
  if (!Array.isArray(image) || image.length === 0 || typeof image[0] !== "object" || image[0] === null) return null;

  const file = image[0] as Record<string, unknown>;
  return {
    filename: safeOutputPart(file.filename, "output filename"),
    subfolder: typeof file.subfolder === "string" ? safeOutputPart(file.subfolder, "output subfolder", true) : "",
    type: typeof file.type === "string" ? safeOutputPart(file.type, "output type") : "output",
  };
}

/** Retrieves only a validated image output through the authenticated ComfyUI proxy. */
export async function downloadApprovedQwenOutput(output: ComfyUiOutput): Promise<{ data: Buffer; contentType: string }> {
  const search = new URLSearchParams({ filename: output.filename, type: output.type });
  if (output.subfolder) search.set("subfolder", output.subfolder);
  const response = await comfyFetch("/view", { headers: { Accept: "image/*" } }, search);
  if (!response.ok) throw new ComfyUiRemoteError(`ComfyUI could not provide the generated image (HTTP ${response.status}).`);

  const data = Buffer.from(await response.arrayBuffer());
  if (!data.byteLength || data.byteLength > MAX_RESULT_BYTES) {
    throw new ComfyUiRemoteError("ComfyUI returned an invalid generated image.");
  }
  const contentType = imageContentType(response.headers.get("content-type"), output.filename);
  if (!contentType.startsWith("image/")) throw new ComfyUiRemoteError("ComfyUI returned an invalid generated image.");
  return { data, contentType };
}
