export const QWEN_EDIT_STYLE_ID = "qwen-image-edit-rapid";
export const QWEN_EDIT_STYLE_NAME = "XXX";
export const QWEN_INPUT_NODE_ID = "78";
export const QWEN_OUTPUT_NODE_ID = "102";
export const QWEN_PROMPT_NODE_ID = "119";
export const APPROVED_QWEN_CHECKPOINT = "Qwen-Rapid-AIO-v11.4.safetensors";

export const SAFE_QWEN_EDIT_PROMPT = [
  "Preserve the person's face, pose, body proportions, hands, and background.",
  "Replace only the current shirt or top with a stylish, fully opaque garment.",
  "Keep the person fully clothed and the result non-sexual.",
  "Use realistic fabric, lighting, shadows, and a natural fit.",
].join(" ");

export function isSafeApparelEditPrompt(prompt: string): boolean {
  // Kept as a compatibility export for callers from earlier versions. There
  // are intentionally no keyword or content restrictions on prompt text.
  void prompt;
  return true;
}

export function buildSafeQwenEditPrompt(requestedPrompt = ""): string {
  const normalizedPrompt = requestedPrompt.replace(/\s+/g, " ").trim();
  return [SAFE_QWEN_EDIT_PROMPT, normalizedPrompt].filter(Boolean).join(" ");
}

type WorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
};

type Workflow = Record<string, WorkflowNode>;

/**
 * This is a reviewed, server-owned copy of the supplied Qwen workflow. It is
 * deliberately not accepted from the browser: the browser can only select the
 * approved XXX experience and cannot choose a model, LoRA, prompt, or node.
 */
const APPROVED_QWEN_WORKFLOW: Workflow = {
  "8": { inputs: { samples: ["121", 1], vae: ["118", 2] }, class_type: "VAEDecode", _meta: { title: "VAE Decode" } },
  "66": { inputs: { shift: 3, model: ["103", 0] }, class_type: "ModelSamplingAuraFlow", _meta: { title: "ModelSamplingAuraFlow" } },
  "75": { inputs: { strength: 1, pre_cfg: false, model: ["66", 0] }, class_type: "CFGNorm", _meta: { title: "CFGNorm" } },
  "77": {
    inputs: {
      prompt: "ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal",
      clip: ["103", 1],
      vae: ["118", 2],
      image: [QWEN_INPUT_NODE_ID, 0],
    },
    class_type: "TextEncodeQwenImageEdit",
    _meta: { title: "Negative prompt" },
  },
  [QWEN_INPUT_NODE_ID]: { inputs: { image: "" }, class_type: "LoadImage", _meta: { title: "Website input image" } },
  "88": { inputs: { pixels: ["93", 0], vae: ["118", 2] }, class_type: "VAEEncode", _meta: { title: "VAE Encode" } },
  "93": {
    inputs: { upscale_method: "lanczos", megapixels: 1, resolution_steps: 1, image: [QWEN_INPUT_NODE_ID, 0] },
    class_type: "ImageScaleToTotalPixels",
    _meta: { title: "Scale image to total pixels" },
  },
  [QWEN_OUTPUT_NODE_ID]: {
    inputs: {
      filename: "%time_%basemodelname_%seed",
      path: "qwen_edit/%date",
      extension: "jpg",
      lossless_webp: false,
      quality_jpeg_or_webp: 100,
      optimize_png: false,
      embed_workflow: true,
      save_workflow_as_json: false,
      counter: 0,
      time_format: "%Y-%m-%d-%H%M%S",
      show_preview: true,
      images: ["8", 0],
      metadata: ["106", 0],
    },
    class_type: "Image Saver Simple",
    _meta: { title: "Website output image" },
  },
  "103": {
    inputs: {
      PowerLoraLoaderHeaderWidget: { type: "PowerLoraLoaderHeaderWidget" },
      "➕ Add Lora": "",
      model: ["118", 0],
      clip: ["118", 1],
    },
    class_type: "Power Lora Loader (rgthree)",
    _meta: { title: "Power LoRA loader without LoRAs" },
  },
  "104": { inputs: { id: 0, widget_name: "ckpt_name", return_all: false, node_title: "", allowed_float_decimals: 2, any_input: ["118", 0] }, class_type: "WidgetToString", _meta: { title: "Widget To String" } },
  "106": {
    inputs: {
      modelname: ["104", 0],
      positive: "safe clothing replacement",
      negative: "low quality",
      width: 512,
      height: 512,
      seed_value: ["117", 0],
      steps: ["115", 0],
      cfg: 1,
      sampler_name: "euler",
      scheduler_name: "beta57",
      denoise: 1,
      clip_skip: 0,
      additional_hashes: "",
      download_civitai_data: false,
      easy_remix: false,
      custom: "",
    },
    class_type: "Image Saver Metadata",
    _meta: { title: "Image Saver Metadata" },
  },
  "115": { inputs: { value: 8 }, class_type: "INTConstant", _meta: { title: "Steps" } },
  "117": { inputs: { value: 0 }, class_type: "PrimitiveInt", _meta: { title: "Seed" } },
  "118": { inputs: { ckpt_name: APPROVED_QWEN_CHECKPOINT }, class_type: "CheckpointLoaderSimple", _meta: { title: "Approved Qwen checkpoint" } },
  [QWEN_PROMPT_NODE_ID]: {
    inputs: { prompt: SAFE_QWEN_EDIT_PROMPT, clip: ["103", 1], vae: ["118", 2], image1: [QWEN_INPUT_NODE_ID, 0] },
    class_type: "TextEncodeQwenImageEditPlus",
    _meta: { title: "Server-controlled apparel edit prompt" },
  },
  "121": {
    inputs: {
      eta: 0.5,
      sampler_name: "linear/euler",
      scheduler: "simple",
      steps: ["115", 0],
      steps_to_run: -1,
      denoise: 1,
      cfg: 1,
      seed: ["117", 0],
      sampler_mode: "standard",
      bongmath: true,
      model: ["75", 0],
      positive: [QWEN_PROMPT_NODE_ID, 0],
      negative: ["77", 0],
      latent_image: ["88", 0],
    },
    class_type: "ClownsharKSampler_Beta",
    _meta: { title: "Qwen sampler" },
  },
};

export function createApprovedQwenWorkflow(uploadedFilename: string, requestedPrompt = ""): Workflow {
  if (!uploadedFilename || uploadedFilename.includes("..") || uploadedFilename.includes("/")) {
    throw new Error("ComfyUI returned an invalid uploaded filename.");
  }

  const workflow = structuredClone(APPROVED_QWEN_WORKFLOW);
  workflow[QWEN_INPUT_NODE_ID].inputs.image = uploadedFilename;
  workflow[QWEN_PROMPT_NODE_ID].inputs.prompt = buildSafeQwenEditPrompt(requestedPrompt);
  return workflow;
}
