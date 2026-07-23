/**
 * ComfyUI POC Service
 * 
 * 連接到本地 ComfyUI 實例 (http://oscarngan.ddns.net:8188)
 * 上傳圖像、執行工作流程、下載結果
 */

import * as fs from 'fs';
import * as path from 'path';

// 使用全局 fetch（Node.js 18+）

const COMFYUI_URL = 'http://oscarngan.ddns.net:8188';
const TEMP_DIR = path.join(process.cwd(), 'temp_comfyui');

// 確保臨時目錄存在
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Qwen 工作流程模板
 * 基於 QwenImageEditRapidv1.0(External).json
 */
function buildQwenWorkflow(imagePath: string, positivePrompt: string = ''): Record<string, any> {
  return {
    "8": {
      "inputs": {
        "samples": ["121", 1],
        "vae": ["118", 2]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "66": {
      "inputs": {
        "shift": 3,
        "model": ["103", 0]
      },
      "class_type": "ModelSamplingAuraFlow",
      "_meta": { "title": "ModelSamplingAuraFlow" }
    },
    "75": {
      "inputs": {
        "strength": 1,
        "pre_cfg": false,
        "model": ["66", 0]
      },
      "class_type": "CFGNorm",
      "_meta": { "title": "CFGNorm" }
    },
    "77": {
      "inputs": {
        "prompt": "ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal, large breasts",
        "clip": ["103", 1],
        "vae": ["118", 2],
        "image": ["78", 0]
      },
      "class_type": "TextEncodeQwenImageEdit",
      "_meta": { "title": "TextEncodeQwenImageEdit" }
    },
    "78": {
      "inputs": {
        "image": imagePath
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "88": {
      "inputs": {
        "pixels": ["93", 0],
        "vae": ["118", 2]
      },
      "class_type": "VAEEncode",
      "_meta": { "title": "VAE Encode" }
    },
    "93": {
      "inputs": {
        "upscale_method": "lanczos",
        "megapixels": 1,
        "resolution_steps": 1,
        "image": ["78", 0]
      },
      "class_type": "ImageScaleToTotalPixels",
      "_meta": { "title": "Scale Image to Total Pixels" }
    },
    "102": {
      "inputs": {
        "filename": "%time_%basemodelname_%seed",
        "path": "qwen_edit/%date",
        "extension": "jpg",
        "lossless_webp": false,
        "quality_jpeg_or_webp": 100,
        "optimize_png": false,
        "embed_workflow": true,
        "save_workflow_as_json": false,
        "counter": 0,
        "time_format": "%Y-%m-%d-%H%M%S",
        "show_preview": true,
        "images": ["8", 0],
        "metadata": ["106", 0]
      },
      "class_type": "Image Saver Simple",
      "_meta": { "title": "Image Saver Simple" }
    },
    "103": {
      "inputs": {
        "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" },
        "➕ Add Lora": "",
        "model": ["118", 0],
        "clip": ["118", 1]
      },
      "class_type": "Power Lora Loader (rgthree)",
      "_meta": { "title": "Power Lora Loader (rgthree)" }
    },
    "104": {
      "inputs": {
        "id": 0,
        "widget_name": "ckpt_name",
        "return_all": false,
        "node_title": "",
        "allowed_float_decimals": 2,
        "any_input": ["118", 0]
      },
      "class_type": "WidgetToString",
      "_meta": { "title": "Widget To String" }
    },
    "106": {
      "inputs": {
        "modelname": ["104", 0],
        "positive": "unknown",
        "negative": "unknown",
        "width": 512,
        "height": 512,
        "seed_value": ["117", 0],
        "steps": ["115", 0],
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler_name": "beta57",
        "denoise": 1,
        "clip_skip": 0,
        "additional_hashes": "",
        "download_civitai_data": true,
        "easy_remix": true,
        "custom": ""
      },
      "class_type": "Image Saver Metadata",
      "_meta": { "title": "Image Saver Metadata" }
    },
    "115": {
      "inputs": { "value": 8 },
      "class_type": "INTConstant",
      "_meta": { "title": "Steps" }
    },
    "117": {
      "inputs": { "value": 0 },
      "class_type": "PrimitiveInt",
      "_meta": { "title": "Seed" }
    },
    "118": {
      "inputs": { "ckpt_name": "Qwen-Rapid-AIO-v11.4.safetensors" },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" }
    },
    "119": {
      "inputs": {
        "prompt": positivePrompt || "",
        "clip": ["103", 1],
        "vae": ["118", 2],
        "image1": ["78", 0]
      },
      "class_type": "TextEncodeQwenImageEditPlus",
      "_meta": { "title": "TextEncodeQwenImageEditPlus" }
    },
    "121": {
      "inputs": {
        "eta": 0.5,
        "sampler_name": "linear/euler",
        "scheduler": "simple",
        "steps": ["115", 0],
        "steps_to_run": -1,
        "denoise": 1,
        "cfg": 1,
        "seed": ["117", 0],
        "sampler_mode": "standard",
        "bongmath": true,
        "model": ["75", 0],
        "positive": ["119", 0],
        "negative": ["77", 0],
        "latent_image": ["88", 0]
      },
      "class_type": "ClownsharKSampler_Beta",
      "_meta": { "title": "ClownsharKSampler" }
    }
  };
}

/**
 * 提交工作流程到 ComfyUI
 */
export async function submitComfyUIWorkflow(
  workflow: Record<string, any>
): Promise<{ prompt_id: string }> {
  console.log('[ComfyUI POC] 提交工作流程到', COMFYUI_URL);

  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ComfyUI POC] 提交失敗:', response.statusText, errorText);
    throw new Error(`ComfyUI 提交失敗: ${response.statusText}`);
  }

  const result = (await response.json()) as { prompt_id: string };
  console.log('[ComfyUI POC] 工作流程已提交，prompt_id:', result.prompt_id);
  return result;
}

/**
 * 輪詢 ComfyUI 獲取結果
 */
export async function pollComfyUIResult(
  promptId: string,
  maxWaitTime: number = 300000 // 5 分鐘
): Promise<{
  status: string;
  outputs: Record<string, any>;
}> {
  const startTime = Date.now();
  const pollInterval = 1000; // 每 1 秒輪詢一次

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await fetch(`${COMFYUI_URL}/history/${promptId}`);

      if (!response.ok) {
        console.log('[ComfyUI POC] 等待結果中...', promptId);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      const history = (await response.json()) as Record<string, any>;

      if (history[promptId]) {
        console.log('[ComfyUI POC] 結果已準備好');
        return {
          status: 'completed',
          outputs: history[promptId].outputs || {},
        };
      }

      console.log('[ComfyUI POC] 等待結果中...', promptId);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('[ComfyUI POC] 輪詢錯誤:', error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('ComfyUI 處理超時');
}

/**
 * 下載 ComfyUI 輸出文件
 */
export async function downloadComfyUIOutput(
  filename: string,
  subfolder: string = ''
): Promise<Buffer> {
  const url = subfolder
    ? `${COMFYUI_URL}/view?filename=${filename}&subfolder=${subfolder}`
    : `${COMFYUI_URL}/view?filename=${filename}`;

  console.log('[ComfyUI POC] 下載輸出:', url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`下載失敗: ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * 完整的 POC 工作流程
 */
export async function runComfyUIPOC(
  imageBuffer: Buffer,
  imageName: string,
  positivePrompt: string = ''
): Promise<{
  success: boolean;
  promptId: string;
  outputPath: string;
  message: string;
}> {
  try {
    console.log('[ComfyUI POC] 開始 POC 工作流程');

    // 1. 保存上傳的圖像到臨時目錄
    const inputImagePath = path.join(TEMP_DIR, imageName);
    fs.writeFileSync(inputImagePath, imageBuffer);
    console.log('[ComfyUI POC] 圖像已保存:', inputImagePath);

    // 2. 構建工作流程
    const workflow = buildQwenWorkflow(inputImagePath, positivePrompt);
    console.log('[ComfyUI POC] 工作流程已構建');

    // 3. 提交到 ComfyUI
    const { prompt_id } = await submitComfyUIWorkflow(workflow);

    // 4. 輪詢結果
    const result = await pollComfyUIResult(prompt_id);
    console.log('[ComfyUI POC] 結果:', result);

    // 5. 下載輸出
    // 搜索所有包含 images 的節點
    const outputs = result.outputs as Record<string, any>;
    let outputFilename = '';
    let outputSubfolder = '';

    console.log('[ComfyUI POC] 搜索輸出節點，可用節點:', Object.keys(outputs));

    // 遍歷所有輸出節點查找圖像
    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
      console.log(`[ComfyUI POC] 檢查節點 ${nodeId}:`, nodeOutput);
      
      if (nodeOutput && typeof nodeOutput === 'object' && 'images' in nodeOutput) {
        const images = (nodeOutput as any).images;
        if (Array.isArray(images) && images.length > 0) {
          const imageOutput = images[0];
          outputFilename = imageOutput.filename;
          outputSubfolder = imageOutput.subfolder || '';
          console.log(`[ComfyUI POC] 在節點 ${nodeId} 找到輸出圖像:`, outputFilename);
          break;
        }
      }
    }

    if (!outputFilename) {
      console.error('[ComfyUI POC] 未找到輸出文件，完整輸出:', JSON.stringify(outputs, null, 2));
      throw new Error(`未找到輸出文件。可用節點: ${Object.keys(outputs).join(', ')}`);
    }

    const outputBuffer = await downloadComfyUIOutput(outputFilename, outputSubfolder);

    // 6. 保存結果
    const outputPath = path.join(TEMP_DIR, `output_${Date.now()}_${outputFilename}`);
    fs.writeFileSync(outputPath, outputBuffer);
    console.log('[ComfyUI POC] 結果已保存:', outputPath);

    return {
      success: true,
      promptId: prompt_id,
      outputPath,
      message: '處理成功',
    };
  } catch (error) {
    console.error('[ComfyUI POC] 錯誤:', error);
    throw error;
  }
}

/**
 * 清理臨時文件
 */
export function cleanupTempFiles(): void {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        fs.unlinkSync(filePath);
      });
      console.log('[ComfyUI POC] 臨時文件已清理');
    }
  } catch (error) {
    console.error('[ComfyUI POC] 清理失敗:', error);
  }
}
