import { TRPCError } from "@trpc/server";
import {
  chargeAndCompleteTryOn,
  getCreditCostForRoute,
  getUserCredits,
  getUserPhotos,
  saveTryOnHistory,
  type TryOnTaskStage,
  updateTryOnHistory,
  updateTryOnTaskStages,
} from "./db";
import { ComfyUiPocError, runComfyUIPOC } from "./comfyuiPoc";
import { createComfyUiPocLiveStatus, updateComfyUiPocLiveStatus } from "./comfyuiPocLiveStatus";
import { QWEN_EDIT_STYLE_ID, QWEN_EDIT_STYLE_NAME } from "./comfyuiQwenWorkflow";
import { storageGetSignedUrl, storagePut } from "./storage";

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

function getInsertedHistoryId(result: unknown): number | null {
  const candidates = Array.isArray(result) ? result : [result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const insertId = Number((candidate as { insertId?: unknown }).insertId);
    if (Number.isSafeInteger(insertId) && insertId > 0) return insertId;
  }
  return null;
}

function extensionForMimeType(mimeType: "image/jpeg" | "image/png" | "image/webp") {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function sourceFileName(photoKey: string) {
  const fileName = photoKey.split("/").at(-1)?.trim();
  return fileName || "shirt-changer-source.jpg";
}

function completedStages(stages: TryOnTaskStage[], label: string): TryOnTaskStage[] {
  return [
    ...stages.map((stage) => stage.state === "active" ? { ...stage, state: "completed" as const } : stage),
    { key: "completed", label, state: "completed" as const, timestamp: Date.now() },
  ];
}

function failedStages(stages: TryOnTaskStage[], message: string): TryOnTaskStage[] {
  return [
    ...stages.map((stage) => stage.state === "active" ? { ...stage, state: "error" as const, detail: message } : stage),
    { key: "failed", label: "XXX edit could not be completed", state: "error" as const, detail: message, timestamp: Date.now() },
  ];
}

async function downloadOwnedPhoto(photoKey: string): Promise<Buffer> {
  const sourceUrl = await storageGetSignedUrl(photoKey);
  const response = await fetch(sourceUrl, { redirect: "error" });
  if (!response.ok) throw new Error("The selected source photo could not be retrieved from storage.");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("The selected source photo is larger than the 25 MB ComfyUI limit.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("The selected source photo is invalid or larger than the 25 MB ComfyUI limit.");
  }
  return bytes;
}

type DashboardQwenPocInput = {
  userId: number;
  photoId: number;
  taskId: string;
  positivePrompt?: string;
};

/**
 * Runs the existing direct Qwen ComfyUI POC for a photo already owned by the
 * caller. A credit is deliberately charged only after the generated output is
 * safely stored and its gallery history record can be finalized.
 */
export async function processDashboardQwenPoc(input: DashboardQwenPocInput) {
  const prompt = input.positivePrompt?.trim() ?? "";
  const creditCost = await getCreditCostForRoute("xxx");
  if (!creditCost) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The administrator credit policy is temporarily unavailable." });
  }
  const balance = await getUserCredits(input.userId);
  if (balance < creditCost) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Insufficient credits. You need at least ${creditCost} credits to use XXX.` });
  }

  const photo = (await getUserPhotos(input.userId)).find((candidate) => candidate.id === input.photoId);
  if (!photo?.photoKey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "The selected photo was not found in your account. Upload a photo and try again." });
  }

  const savedHistory = await saveTryOnHistory({
    userId: input.userId,
    photoId: input.photoId,
    shirtStyle: QWEN_EDIT_STYLE_ID,
    status: "pending",
    creditsDeducted: 0,
  });
  const historyId = getInsertedHistoryId(savedHistory);
  if (!historyId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create the XXX gallery record." });

  let taskFinalized = false;

  let stages: TryOnTaskStage[] = [
    { key: "photo_verified", label: "Photo ownership verified", state: "completed", timestamp: Date.now() },
    { key: "task_created", label: "XXX processing task created", state: "completed", timestamp: Date.now() },
    { key: "source_preparation", label: "Preparing your uploaded photo", state: "active", timestamp: Date.now() },
  ];
  await updateTryOnTaskStages(historyId, stages);
  createComfyUiPocLiveStatus(input.taskId, input.userId);

  try {
    const sourceImage = await downloadOwnedPhoto(photo.photoKey);
    stages = [
      ...stages.map((stage) => stage.key === "source_preparation" ? { ...stage, state: "completed" as const } : stage),
      { key: "qwen_processing", label: "Qwen is editing your selected shirt", state: "active", timestamp: Date.now() },
    ];
    await updateTryOnTaskStages(historyId, stages);

    const result = await runComfyUIPOC(sourceImage, sourceFileName(photo.photoKey), prompt, {
      clientId: input.taskId,
      onProgress: (update) => updateComfyUiPocLiveStatus(input.taskId, input.userId, update),
    });

    updateComfyUiPocLiveStatus(input.taskId, input.userId, {
      phase: "executing",
      label: "Saving the completed XXX edit to your gallery.",
      estimatedSecondsRemaining: null,
    });
    stages = [
      ...stages.map((stage) => stage.state === "active" ? { ...stage, state: "completed" as const } : stage),
      { key: "gallery_save", label: "Saving the completed result to your private gallery", state: "active", timestamp: Date.now() },
    ];
    await updateTryOnTaskStages(historyId, stages);

    const stored = await storagePut(
      `comfyui-results/${input.userId}/${historyId}.${extensionForMimeType(result.outputMimeType)}`,
      result.outputBuffer,
      result.outputMimeType,
    );

    // The output exists safely in managed storage before any account balance is
    // changed. If charging or finalization fails, the history remains failed and
    // the user is not shown a completed gallery result.
    const finalized = await chargeAndCompleteTryOn({
      userId: input.userId,
      historyId,
      creditCost,
      resultImageUrl: stored.url,
      resultImageKey: stored.key,
    });
    if (finalized !== "charged") {
      const message = finalized === "insufficient_credits"
        ? `Your result was created, but ${creditCost} credits are no longer available, so it was not added to your gallery. No credits were deducted.`
        : "The saved result could not be finalized in your gallery. No credits were deducted.";
      await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
      await updateTryOnTaskStages(historyId, failedStages(stages, message));
      updateComfyUiPocLiveStatus(input.taskId, input.userId, { phase: "failed", label: message, estimatedSecondsRemaining: null });
      return { success: false as const, message, diagnostics: result.diagnostics };
    }
    taskFinalized = true;

    stages = completedStages(stages, "XXX edit saved to your private gallery");
    await updateTryOnTaskStages(historyId, stages);
    updateComfyUiPocLiveStatus(input.taskId, input.userId, {
      phase: "completed",
      label: "XXX edit complete and saved to your private gallery.",
      estimatedSecondsRemaining: 0,
    });
    return {
      success: true as const,
      resultImageUrl: stored.url,
      shirtApplied: QWEN_EDIT_STYLE_NAME,
      creditsRemaining: await getUserCredits(input.userId),
      galleryHistoryId: historyId,
      diagnostics: result.diagnostics,
    };
  } catch (error) {
    const message = error instanceof ComfyUiPocError
      ? error.message
      : error instanceof Error
        ? error.message
        : "The XXX edit could not be completed.";
    if (!taskFinalized) {
      await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
      await updateTryOnTaskStages(historyId, failedStages(stages, message));
      updateComfyUiPocLiveStatus(input.taskId, input.userId, { phase: "failed", label: message, estimatedSecondsRemaining: null });
    }
    if (error instanceof TRPCError) throw error;
    return { success: false as const, message, diagnostics: error instanceof ComfyUiPocError ? error.diagnostics : [] };
  }
}
