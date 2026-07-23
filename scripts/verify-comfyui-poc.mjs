import { runComfyUIPOC } from "../server/comfyuiPoc.ts";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5xQAAAABJRU5ErkJggg==",
  "base64",
);
const suppliedImagePath = process.argv[2];
const sourceImage = suppliedImagePath ? await readFile(suppliedImagePath) : onePixelPng;
const sourceFilename = suppliedImagePath ? basename(suppliedImagePath) : "poc-remote-verification.png";

try {
  const result = await runComfyUIPOC(
    sourceImage,
    sourceFilename,
    "Replace only the shirt with a plain blue T-shirt. Preserve the person, background, pose, and lighting.",
  );

  console.log(JSON.stringify({
    success: result.success,
    promptId: result.promptId,
    outputMimeType: result.outputMimeType,
    outputBytes: result.outputBuffer.length,
    diagnostics: result.diagnostics.map(({ key, label }) => ({ key, label })),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "The verifier failed unexpectedly.",
    diagnostics: error && typeof error === "object" && "diagnostics" in error
      ? error.diagnostics
      : [],
  }, null, 2));
  process.exitCode = 1;
}
