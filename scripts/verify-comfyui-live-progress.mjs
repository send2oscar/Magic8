import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runComfyUIPOC } from "../server/comfyuiPoc.ts";

const inputPath = process.env.COMFYUI_POC_INPUT ?? "/home/ubuntu/upload/123.jpg";
const source = await readFile(inputPath);
const events = [];

const result = await runComfyUIPOC(
  source,
  basename(inputPath),
  "Replace only the person's shirt with a realistic, well-fitting blue shirt. Preserve the person's identity, face, body proportions, pose, background, lighting, camera framing, and image quality.",
  {
    clientId: randomUUID(),
    onProgress: (event) => {
      events.push({ ...event, at: new Date().toISOString() });
    },
  },
);

const progressEvents = events.filter((event) => typeof event.percent === "number");
const summary = {
  success: result.success,
  promptId: result.promptId,
  outputMimeType: result.outputMimeType,
  outputBytes: result.outputBuffer.length,
  eventCount: events.length,
  sawSamplerProgress: progressEvents.length > 0,
  maxPercent: progressEvents.length ? Math.max(...progressEvents.map((event) => event.percent)) : null,
  sawEstimatedTime: progressEvents.some((event) => typeof event.estimatedSecondsRemaining === "number"),
  events,
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.sawSamplerProgress) {
  process.exitCode = 2;
}
