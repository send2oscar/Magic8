#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

const BRIDGE_HOME = process.env.SHIRT_CHANGER_BRIDGE_HOME || join(homedir(), ".shirt-changer-bridge");
const CONFIG_PATH = join(BRIDGE_HOME, "config.json");
const POLL_INTERVAL_MS = 3_000;
const COMFY_POLL_INTERVAL_MS = 2_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PROCESSING_MS = 30 * 60 * 1_000;
const WORKFLOW_ID = "qwen-image-edit-rapid";

type BridgeConfig = {
  siteUrl: string;
  credential: string;
  deviceId: number;
  label: string;
  comfyUrl: string;
};

type ClaimedTask = {
  id: number;
  historyId: number;
  workflowId: string;
  sourceImageUrl: string;
  positivePrompt: string;
  leaseCredential: string;
  leaseExpiresAt: Date | string;
};

type ComfyUploadResponse = { name?: string; subfolder?: string; type?: string };
type ComfyPromptResponse = { prompt_id?: string; error?: unknown; node_errors?: Record<string, unknown> };
type ComfyOutputImage = { filename?: string; subfolder?: string; type?: string };

function usage(): never {
  console.error(`\nShirt Changer local Bridge\n\nUsage:\n  pnpm bridge:pair -- --site https://your-site.example --code PAIRING-CODE [--label \"ComfyUI workstation\"] [--comfy-url http://127.0.0.1:8188]\n  pnpm bridge:run\n  pnpm bridge:status\n\nThe device credential is stored only in ${CONFIG_PATH}.\n`);
  process.exit(1);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeSiteUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("The website URL must use HTTPS outside local development.");
  }
  return url.origin;
}

function apiFor(siteUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: new URL("/api/trpc", siteUrl).toString(), transformer: superjson })],
  });
}

async function writeConfig(config: BridgeConfig) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(CONFIG_PATH, 0o600).catch(() => undefined);
}

async function loadConfig(): Promise<BridgeConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeConfig>;
    if (!parsed.siteUrl || !parsed.credential || !parsed.deviceId || !parsed.comfyUrl) throw new Error("missing required configuration fields");
    return {
      siteUrl: normalizeSiteUrl(parsed.siteUrl),
      credential: parsed.credential,
      deviceId: parsed.deviceId,
      label: parsed.label || "ComfyUI workstation",
      comfyUrl: new URL(parsed.comfyUrl).origin,
    };
  } catch (error) {
    throw new Error(`Bridge is not paired. Run \"pnpm bridge:pair -- --site … --code …\" first (${error instanceof Error ? error.message : "configuration unavailable"}).`);
  }
}

function contentTypeFromFilename(filename: string): "image/jpeg" | "image/png" | "image/webp" {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function contentTypeFromHeader(value: string | null): "image/jpeg" | "image/png" | "image/webp" {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/webp") return "image/webp";
  return "image/jpeg";
}

function safeErrorText(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function fullHttpFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return `HTTP ${response.status}${text ? `\n${text}` : ""}`;
}

function workflowFor(uploadedFilename: string, positivePrompt: string): Record<string, unknown> {
  if (!uploadedFilename || uploadedFilename.includes("..") || uploadedFilename.startsWith("/")) {
    throw new Error("ComfyUI returned an invalid uploaded filename.");
  }
  return {
    "8": { inputs: { samples: ["121", 1], vae: ["118", 2] }, class_type: "VAEDecode" },
    "66": { inputs: { shift: 3, model: ["103", 0] }, class_type: "ModelSamplingAuraFlow" },
    "75": { inputs: { strength: 1, pre_cfg: false, model: ["66", 0] }, class_type: "CFGNorm" },
    "77": { inputs: { prompt: "ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal", clip: ["103", 1], vae: ["118", 2], image: ["78", 0] }, class_type: "TextEncodeQwenImageEdit" },
    "78": { inputs: { image: uploadedFilename }, class_type: "LoadImage" },
    "88": { inputs: { pixels: ["93", 0], vae: ["118", 2] }, class_type: "VAEEncode" },
    "93": { inputs: { upscale_method: "lanczos", megapixels: 1, resolution_steps: 1, image: ["78", 0] }, class_type: "ImageScaleToTotalPixels" },
    "102": { inputs: { filename_prefix: "shirt-changer-bridge", images: ["8", 0] }, class_type: "SaveImage" },
    "103": { inputs: { PowerLoraLoaderHeaderWidget: { type: "PowerLoraLoaderHeaderWidget" }, "➕ Add Lora": "", model: ["118", 0], clip: ["118", 1] }, class_type: "Power Lora Loader (rgthree)" },
    "115": { inputs: { value: 8 }, class_type: "INTConstant" },
    "117": { inputs: { value: 0 }, class_type: "PrimitiveInt" },
    "118": { inputs: { ckpt_name: "Qwen-Rapid-AIO-v11.4.safetensors" }, class_type: "CheckpointLoaderSimple" },
    "119": { inputs: { prompt: positivePrompt, clip: ["103", 1], vae: ["118", 2], image1: ["78", 0] }, class_type: "TextEncodeQwenImageEditPlus" },
    "121": { inputs: { eta: 0.5, sampler_name: "linear/euler", scheduler: "simple", steps: ["115", 0], steps_to_run: -1, denoise: 1, cfg: 1, seed: ["117", 0], sampler_mode: "standard", bongmath: true, model: ["75", 0], positive: ["119", 0], negative: ["77", 0], latent_image: ["88", 0] }, class_type: "ClownsharKSampler_Beta" },
  };
}

async function fetchSource(task: ClaimedTask): Promise<{ bytes: Buffer; filename: string }> {
  const response = await fetch(task.sourceImageUrl);
  if (!response.ok) throw new Error(`The secure source-image URL could not be downloaded. ${await fullHttpFailure(response)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("The secure source image is empty or exceeds the 25 MB Bridge limit.");
  const extension = contentTypeFromHeader(response.headers.get("content-type")).split("/")[1].replace("jpeg", "jpg");
  return { bytes, filename: `shirt-changer-bridge-${Date.now()}-${randomUUID()}.${extension}` };
}

async function uploadToComfy(config: BridgeConfig, image: { bytes: Buffer; filename: string }): Promise<string> {
  const boundary = `----shirtChangerBridge${randomUUID().replaceAll("-", "")}`;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${image.filename}"\r\nContent-Type: ${contentTypeFromFilename(image.filename)}\r\n\r\n`, "utf8");
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([prefix, image.bytes, suffix]);
  const response = await fetch(`${config.comfyUrl}/upload/image`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": String(body.length) },
    body,
  });
  const payload = await readJson<ComfyUploadResponse>(response);
  if (!response.ok || !payload?.name) throw new Error(`ComfyUI rejected the source-image upload. HTTP ${response.status}`);
  return [payload.subfolder, payload.name].filter(Boolean).join("/");
}

async function submitToComfy(config: BridgeConfig, task: ClaimedTask, inputFilename: string): Promise<string> {
  const response = await fetch(`${config.comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflowFor(inputFilename, task.positivePrompt), client_id: `shirt-changer-bridge-${task.id}` }),
  });
  const payload = await readJson<ComfyPromptResponse>(response);
  if (!response.ok || !payload?.prompt_id) {
    throw new Error(`ComfyUI rejected the fixed Qwen workflow. HTTP ${response.status}\n${JSON.stringify(payload ?? {})}`);
  }
  return payload.prompt_id;
}

function outputImageFromHistory(history: Record<string, unknown>, promptId: string): ComfyOutputImage | null {
  const item = history[promptId] as { outputs?: Record<string, unknown>; status?: { status_str?: string; messages?: unknown[] } } | undefined;
  if (!item) return null;
  if (item.status?.status_str && item.status.status_str !== "success") {
    throw new Error(`ComfyUI execution failed.\n${JSON.stringify(item.status.messages ?? [])}`);
  }
  const nodeOutput = item.outputs?.["102"] as { images?: ComfyOutputImage[] } | undefined;
  const image = nodeOutput?.images?.[0];
  if (!image?.filename) throw new Error("ComfyUI reported a successful task without an image at required output node 102.");
  return image;
}

async function downloadComfyOutput(config: BridgeConfig, image: ComfyOutputImage): Promise<{ bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" }> {
  const query = new URLSearchParams({ filename: image.filename!, type: image.type || "output" });
  if (image.subfolder) query.set("subfolder", image.subfolder);
  const response = await fetch(`${config.comfyUrl}/view?${query.toString()}`);
  if (!response.ok) throw new Error(`ComfyUI output image could not be downloaded. ${await fullHttpFailure(response)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("ComfyUI returned an empty output or one larger than the 25 MB Bridge limit.");
  return { bytes, mimeType: contentTypeFromHeader(response.headers.get("content-type")) };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reportProgress(api: any, config: BridgeConfig, task: ClaimedTask, input: {
  progressKey: string;
  progressLabel: string;
  progressDetail?: string;
  promptId?: string;
}) {
  await api.bridge.progress.mutate({
    credential: config.credential,
    taskId: task.id,
    leaseCredential: task.leaseCredential,
    status: "processing",
    ...input,
  });
}

async function runTask(api: any, config: BridgeConfig, task: ClaimedTask) {
  if (task.workflowId !== WORKFLOW_ID) throw new Error(`The claimed Bridge task requested unsupported workflow \"${task.workflowId}\".`);
  await reportProgress(api, config, task, {
    progressKey: "bridge_source_download",
    progressLabel: "Bridge is downloading the secure source image",
    progressDetail: "The local workstation is preparing the private image for ComfyUI.",
  });
  const source = await fetchSource(task);
  await reportProgress(api, config, task, {
    progressKey: "comfy_upload",
    progressLabel: "Bridge is uploading the source image to local ComfyUI",
    progressDetail: "ComfyUI is receiving the image through its loopback-only API.",
  });
  const inputFilename = await uploadToComfy(config, source);
  await reportProgress(api, config, task, {
    progressKey: "comfy_submit",
    progressLabel: "Bridge is submitting the fixed Qwen edit workflow",
    progressDetail: "The exact Dashboard prompt is being passed to the fixed Qwen prompt node.",
  });
  const promptId = await submitToComfy(config, task, inputFilename);
  await reportProgress(api, config, task, {
    progressKey: "comfy_queued",
    progressLabel: "ComfyUI accepted the XXX edit and added it to its queue",
    progressDetail: "Waiting for the local ComfyUI history record. ComfyUI did not provide a reliable ETA.",
    promptId,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_PROCESSING_MS) {
    const response = await fetch(`${config.comfyUrl}/history/${encodeURIComponent(promptId)}`);
    if (response.ok) {
      const history = await readJson<Record<string, unknown>>(response);
      if (history) {
        const image = outputImageFromHistory(history, promptId);
        if (image) {
          await reportProgress(api, config, task, {
            progressKey: "comfy_output",
            progressLabel: "ComfyUI completed the Qwen edit; Bridge is retrieving the output",
            progressDetail: "The fixed output node 102 returned the generated image.",
            promptId,
          });
          const output = await downloadComfyOutput(config, image);
          await api.bridge.complete.mutate({
            credential: config.credential,
            taskId: task.id,
            leaseCredential: task.leaseCredential,
            outputBase64: output.bytes.toString("base64"),
            mimeType: output.mimeType,
          });
          return;
        }
      }
    }
    await reportProgress(api, config, task, {
      progressKey: "comfy_processing",
      progressLabel: "Qwen image edit is running on local ComfyUI",
      progressDetail: "The Bridge remains connected and is checking ComfyUI for the required output node 102.",
      promptId,
    });
    await delay(COMFY_POLL_INTERVAL_MS);
  }
  throw new Error("The local ComfyUI job did not complete within the 30-minute Bridge processing limit.");
}

async function pair() {
  const site = option("--site");
  const code = option("--code");
  if (!site || !code) usage();
  const siteUrl = normalizeSiteUrl(site);
  const label = option("--label") || `${hostname()} ComfyUI workstation`;
  const comfyUrl = new URL(option("--comfy-url") || "http://127.0.0.1:8188").origin;
  const api: any = apiFor(siteUrl);
  const paired = await api.bridge.pair.mutate({ code, label });
  await writeConfig({ siteUrl, credential: paired.credential, deviceId: paired.deviceId, label, comfyUrl });
  console.log(`Paired \"${label}\" as device ${paired.deviceId}. The credential is stored only in ${CONFIG_PATH}.`);
}

async function status() {
  const config = await loadConfig();
  const api: any = apiFor(config.siteUrl);
  const result = await api.bridge.heartbeat.mutate({ credential: config.credential });
  console.log(`Bridge ${config.deviceId} is paired and online (${result.status}); local ComfyUI target: ${config.comfyUrl}.`);
}

async function run() {
  const config = await loadConfig();
  const api: any = apiFor(config.siteUrl);
  let running = true;
  const stop = () => { running = false; console.log("Stopping Bridge after the current poll."); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`Bridge ${config.deviceId} is running. It only calls ${config.comfyUrl} and sends outbound HTTPS requests to ${config.siteUrl}.`);

  while (running) {
    try {
      await api.bridge.heartbeat.mutate({ credential: config.credential });
      const claimed = await api.bridge.claim.mutate({ credential: config.credential });
      const task = claimed.task as ClaimedTask | null;
      if (!task) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }
      console.log(`Claimed XXX task ${task.id} for history ${task.historyId}.`);
      try {
        await runTask(api, config, task);
        console.log(`Completed XXX task ${task.id}.`);
      } catch (error) {
        const message = safeErrorText(error);
        console.error(`XXX task ${task.id} failed:\n${message}`);
        await api.bridge.fail.mutate({ credential: config.credential, taskId: task.id, leaseCredential: task.leaseCredential, message });
      }
    } catch (error) {
      console.error(`Bridge polling error: ${safeErrorText(error)}`);
      await delay(POLL_INTERVAL_MS);
    }
  }
}

const command = process.argv[2];
if (command === "pair") pair().catch(error => { console.error(safeErrorText(error)); process.exit(1); });
else if (command === "run") run().catch(error => { console.error(safeErrorText(error)); process.exit(1); });
else if (command === "status") status().catch(error => { console.error(safeErrorText(error)); process.exit(1); });
else usage();
