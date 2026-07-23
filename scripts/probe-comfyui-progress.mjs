import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { buildQwenWorkflow } from "../server/comfyuiPoc.ts";

const baseUrl = "http://oscarngan.ddns.net:8188";
const clientId = randomUUID();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5xQAAAABJRU5ErkJggg==",
  "base64",
);
const suppliedImagePath = process.argv[2];
const sourceImage = suppliedImagePath ? await readFile(suppliedImagePath) : png;
const sourceFilename = suppliedImagePath ? basename(suppliedImagePath) : `progress-probe-${Date.now()}.png`;
const filename = `progress-probe-${Date.now()}-${sourceFilename.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}`;

function multipartImageBody(image, imageFilename) {
  const boundary = `----progressProbe${randomUUID().replaceAll("-", "")}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${imageFilename}"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8",
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([prefix, image, suffix]) };
}

function safeEvent(message, promptId) {
  const data = message?.data ?? {};
  if (data.prompt_id && data.prompt_id !== promptId) return null;
  if (!data.prompt_id && !["status", "executing"].includes(message?.type)) return null;
  const value = Number.isFinite(data.value) ? data.value : undefined;
  const max = Number.isFinite(data.max) ? data.max : undefined;
  const node = typeof data.node === "string" || typeof data.node === "number" ? String(data.node) : undefined;
  const queueRemaining = Number.isFinite(data.queue_remaining) ? data.queue_remaining : undefined;
  return {
    type: typeof message?.type === "string" ? message.type : "unknown",
    ...(node ? { node } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(queueRemaining !== undefined ? { queueRemaining } : {}),
    dataKeys: Object.keys(data).filter((key) => !["prompt", "extra_pnginfo", "workflow"].includes(key)).sort(),
  };
}

const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws?clientId=${encodeURIComponent(clientId)}`);
const messages = [];
let promptId = null;

socket.addEventListener("message", (event) => {
  try {
    messages.push(JSON.parse(String(event.data)));
  } catch {
    // Ignore non-JSON payloads: the probe only documents structured progress events.
  }
});

await Promise.race([
  new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("ComfyUI WebSocket connection failed.")), { once: true });
  }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("ComfyUI WebSocket connection timed out.")), 15_000)),
]);

const { boundary, body } = multipartImageBody(sourceImage, filename);
const upload = await fetch(`${baseUrl}/upload/image`, {
  method: "POST",
  headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": String(body.length) },
  body,
});
const uploaded = await upload.json();
if (!upload.ok || !uploaded?.name) throw new Error("Progress probe image upload failed.");

const inputFilename = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
const prompt = await fetch(`${baseUrl}/prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: clientId,
    prompt: buildQwenWorkflow(inputFilename, "Replace only the shirt with a plain blue T-shirt. Preserve the person, background, pose, and lighting."),
  }),
});
const submitted = await prompt.json();
if (!prompt.ok || !submitted?.prompt_id) throw new Error("Progress probe prompt submission failed.");
promptId = submitted.prompt_id;

await Promise.race([
  new Promise((resolve) => {
    const stopWhenComplete = () => {
      if (messages.some((message) => message?.type === "executing" && message?.data?.prompt_id === promptId && !message?.data?.node)) resolve();
      else setTimeout(stopWhenComplete, 500);
    };
    stopWhenComplete();
  }),
  new Promise((resolve) => setTimeout(resolve, 150_000)),
]);

socket.close();
await Promise.race([
  new Promise((resolve) => socket.addEventListener("close", resolve, { once: true })),
  new Promise((resolve) => setTimeout(resolve, 2_000)),
]);
const events = messages.map((message) => safeEvent(message, promptId)).filter(Boolean);
console.log(JSON.stringify({ promptId, eventTypes: [...new Set(events.map((entry) => entry.type))], events }, null, 2));
