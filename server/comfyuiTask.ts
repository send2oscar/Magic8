import { TRPCError } from "@trpc/server";
import {
  addCredits,
  chargeAndCompleteTryOn,
  deductCredits,
  failPendingTryOnTask,
  getComfyUiTaskMetadata,
  getCreditCostForRoute,
  getUserCredits,
  getUserPhotos,
  getUserTryOnTask,
  saveTryOnHistory,
  type ComfyUiTaskMetadata,
  type TryOnTaskStage,
  updateTryOnHistory,
  updateTryOnTaskStages,
} from "./db";
import {
  checkComfyUiConnection,
  ComfyUiConfigurationError,
  ComfyUiRemoteError,
  ComfyUiTaskExecutionError,
  downloadApprovedQwenOutput,
  getApprovedQwenOutput,
  getApprovedQwenTaskProgress,
  submitApprovedQwenEdit,
} from "./comfyui";
import {
  DEFAULT_QWEN_LORA_WEIGHTS,
  QWEN_EDIT_STYLE_ID,
  QWEN_EDIT_STYLE_NAME,
  type QwenLoraWeights,
} from "./comfyuiQwenWorkflow";
import { storagePut } from "./storage";

function getInsertedHistoryId(result: unknown): number | null {
  const candidates = Array.isArray(result) ? result : [result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const insertId = Number((candidate as { insertId?: unknown }).insertId);
    if (Number.isSafeInteger(insertId) && insertId > 0) return insertId;
  }
  return null;
}

function getTaskStages(serialized: string | null): TryOnTaskStage[] {
  try {
    const parsed = JSON.parse(serialized ?? "{}") as { taskStages?: unknown };
    return Array.isArray(parsed.taskStages) ? parsed.taskStages as TryOnTaskStage[] : [];
  } catch {
    return [];
  }
}

function advanceStage(stages: TryOnTaskStage[], key: string, label: string, detail?: string): TryOnTaskStage[] {
  const next = stages.map(stage => stage.state === "active" ? { ...stage, state: "completed" as const } : stage);
  return [...next, { key, label, state: "active", detail, timestamp: Date.now() }];
}

function setActiveStage(stages: TryOnTaskStage[], key: string, label: string, detail?: string): TryOnTaskStage[] {
  const existingActive = stages.find(stage => stage.state === "active");
  if (existingActive?.key === key) {
    return stages.map(stage => stage.key === key && stage.state === "active"
      ? { ...stage, label, detail, timestamp: Date.now() }
      : stage);
  }
  return advanceStage(stages, key, label, detail);
}

function completeStage(stages: TryOnTaskStage[], key: string, label: string): TryOnTaskStage[] {
  const next = stages.map(stage => stage.state === "active" ? { ...stage, state: "completed" as const } : stage);
  return [...next, { key, label, state: "completed", timestamp: Date.now() }];
}

function failStages(stages: TryOnTaskStage[], message: string): TryOnTaskStage[] {
  const next = stages.map(stage => stage.state === "active" ? { ...stage, state: "error" as const, detail: message } : stage);
  return [...next, { key: "failed", label: "Qwen edit could not be completed", state: "error", detail: message, timestamp: Date.now() }];
}

function safeErrorMessage(error: unknown, legacyReservedCredits: number = 0): string {
  const detail = error instanceof Error && error.message
    ? error.message
    : "The Qwen edit could not be completed.";
  return legacyReservedCredits > 0
    ? `${detail} Your ${legacyReservedCredits} credits have been returned.`
    : `${detail} No credits were deducted.`;
}

async function failWithoutCharge(
  userId: number,
  historyId: number,
  stages: TryOnTaskStage[],
  message: string,
  legacyReservedCredits: number = 0,
  metadata?: ComfyUiTaskMetadata,
) {
  const markedFailed = await failPendingTryOnTask(historyId, failStages(stages, message), metadata);
  if (!markedFailed) return;
  if (legacyReservedCredits > 0) {
    const refunded = await addCredits(userId, legacyReservedCredits);
    if (!refunded) console.error("[ComfyUI] Failed to refund legacy XXX reservation", { historyId, credits: legacyReservedCredits });
  }
}

/** Creates a durable direct-ComfyUI Qwen task using the fixed approved workflow. */
export async function startApprovedQwenTask(
  userId: number,
  photoId: number,
  positivePrompt?: string,
  requestedLoraWeights: Partial<QwenLoraWeights> = {},
) {
  const prompt = positivePrompt ?? "";
  const loraWeights: QwenLoraWeights = { ...DEFAULT_QWEN_LORA_WEIGHTS, ...requestedLoraWeights };
  const creditCost = await getCreditCostForRoute("xxx");
  if (!creditCost) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The administrator credit policy is temporarily unavailable." });
  }
  const balance = await getUserCredits(userId);
  if (balance < creditCost) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Insufficient credits. You need at least ${creditCost} credits to use XXX.` });
  }

  const photo = (await getUserPhotos(userId)).find(candidate => candidate.id === photoId);
  if (!photo?.photoKey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "The selected photo was not found in your account. Upload a photo and try again." });
  }

  console.info("[TryOn Route]", {
    userId,
    photoId,
    shirtStyle: QWEN_EDIT_STYLE_ID,
    route: "local-comfyui-qwen",
  });

  const savedHistory = await saveTryOnHistory({
    userId,
    photoId,
    shirtStyle: QWEN_EDIT_STYLE_ID,
    status: "pending",
    creditsDeducted: 0,
  });
  const historyId = getInsertedHistoryId(savedHistory);
  if (!historyId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create the Qwen task." });

  let stages: TryOnTaskStage[] = [
    {
      key: "route_selected",
      label: "Local ComfyUI route selected",
      state: "completed",
      detail: `route=local-comfyui-qwen; shirtStyle=${QWEN_EDIT_STYLE_ID}`,
      timestamp: Date.now(),
    },
    { key: "photo_verified", label: "Photo ownership verified", state: "completed", timestamp: Date.now() },
    { key: "task_created", label: "XXX processing task created", state: "completed", timestamp: Date.now() },
  ];
  await updateTryOnTaskStages(historyId, stages);

  stages = advanceStage(stages, "credit_pending", `${creditCost} credit${creditCost === 1 ? "" : "s"} will be charged after completion`);
  await updateTryOnTaskStages(historyId, stages);

  try {
    stages = advanceStage(stages, "comfyui_connection", "Checking direct ComfyUI connection");
    await updateTryOnTaskStages(historyId, stages);
    await checkComfyUiConnection();

    stages = advanceStage(stages, "source_upload", "Sending the selected photo to Qwen");
    await updateTryOnTaskStages(historyId, stages);
    const job = await submitApprovedQwenEdit(photo.photoKey, prompt, loraWeights);
      const metadata: ComfyUiTaskMetadata = {
        kind: QWEN_EDIT_STYLE_ID,
        promptId: job.promptId,
        uploadedFilename: job.uploadedFilename,
        queuedAt: Date.now(),
        creditCost,
        positivePrompt: prompt,
        loraWeights,
      };
    stages = advanceStage(stages, "qwen_queued", "Qwen edit queued in ComfyUI", "The server will keep checking ComfyUI and save the result in Gallery.");
    await updateTryOnTaskStages(historyId, stages, metadata);

    return { taskId: historyId, status: "pending" as const, creditsRemaining: balance, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error("[ComfyUI] Failed to start Qwen task", { historyId, category: error instanceof ComfyUiConfigurationError ? "configuration" : "remote" });
    await failWithoutCharge(userId, historyId, stages, message);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}

/** Checks a persisted Qwen prompt, writes the safely retrieved image to S3, and finalizes the gallery item. */
export async function refreshApprovedQwenTask(userId: number, historyId: number) {
  const task = await getUserTryOnTask(userId, historyId);
  if (!task || task.shirtStyle !== QWEN_EDIT_STYLE_ID) {
    throw new TRPCError({ code: "NOT_FOUND", message: "The requested XXX task was not found." });
  }
  if (task.status === "success") return { status: "success" as const, resultImageUrl: task.resultImageUrl, shirtApplied: QWEN_EDIT_STYLE_NAME };
  if (task.status === "failed") return { status: "failed" as const, message: "The Qwen edit was not completed. Your credit has been returned." };

  const metadata = getComfyUiTaskMetadata(task.bubbleApiResponse);
  const existingStages = getTaskStages(task.bubbleApiResponse);
  if (!metadata) {
    const legacyReservedCredits = task.creditsDeducted > 0 ? task.creditsDeducted : 0;
    const message = legacyReservedCredits > 0
      ? `The Qwen task could not be recovered. Your ${legacyReservedCredits} credits have been returned.`
      : "The Qwen task could not be recovered. No credits were deducted.";
    await failWithoutCharge(userId, historyId, existingStages, message, legacyReservedCredits);
    return { status: "failed" as const, message };
  }

  try {
    const output = await getApprovedQwenOutput(metadata.promptId);
    if (!output) {
      const progress = await getApprovedQwenTaskProgress(metadata.promptId);
      const stages = progress.phase === "executing"
        ? setActiveStage(existingStages, "qwen_executing", "Qwen is executing the image edit", "ComfyUI reports that this task is currently running.")
        : progress.phase === "queued"
          ? setActiveStage(
            existingStages,
            "qwen_queued",
            "Qwen edit is queued in ComfyUI",
            progress.queueRemaining && progress.queueRemaining > 0
              ? `${progress.queueRemaining} task${progress.queueRemaining === 1 ? "" : "s"} ahead in the ComfyUI queue.`
              : "The task is next in the ComfyUI queue.",
          )
          : setActiveStage(existingStages, "qwen_waiting", "Waiting for Qwen to finish", "ComfyUI queue status is temporarily unavailable; result polling continues.");
      await updateTryOnTaskStages(historyId, stages, metadata);
      return {
        status: "pending" as const,
        stages,
        queueRemaining: progress.queueRemaining,
        estimatedSecondsRemaining: progress.estimatedSecondsRemaining,
      };
    }

    const stages = advanceStage(existingStages, "result_saving", "Saving generated result");
    await updateTryOnTaskStages(historyId, stages, metadata);
    const result = await downloadApprovedQwenOutput(output);
    const extension = output.filename.split(".").pop()?.toLowerCase() || "jpg";
    const stored = await storagePut(`comfyui-results/${userId}/${historyId}.${extension}`, result.data, result.contentType);
    const legacyReservedCredits = task.creditsDeducted > 0 ? task.creditsDeducted : 0;
    const policyCost = legacyReservedCredits || metadata.creditCost || await getCreditCostForRoute("xxx");
    if (!policyCost) {
      const message = "The XXX result could not be finalized because the administrator credit policy is unavailable. No credits were deducted.";
      await failWithoutCharge(userId, historyId, stages, message, legacyReservedCredits, metadata);
      return { status: "failed" as const, message };
    }
    if (legacyReservedCredits > 0) {
      await updateTryOnHistory(historyId, { status: "success", resultImageUrl: stored.url, resultImageKey: stored.key, creditsDeducted: legacyReservedCredits });
    } else {
      const finalized = await chargeAndCompleteTryOn({
        userId,
        historyId,
        creditCost: policyCost,
        resultImageUrl: stored.url,
        resultImageKey: stored.key,
      });
      if (finalized !== "charged") {
        if (finalized === "already_finalized") {
          const latest = await getUserTryOnTask(userId, historyId);
          if (latest?.status === "success") {
            return { status: "success" as const, resultImageUrl: latest.resultImageUrl, shirtApplied: QWEN_EDIT_STYLE_NAME };
          }
        }
        const message = finalized === "insufficient_credits"
          ? `Your XXX result was generated, but ${policyCost} credits are no longer available. No credits were deducted, so it was not added to your Gallery.`
          : "The XXX result could not be finalized. No credits were deducted.";
        await failWithoutCharge(userId, historyId, stages, message, 0, metadata);
        return { status: "failed" as const, message };
      }
    }
    await updateTryOnTaskStages(historyId, completeStage(stages, "completed", "XXX edit complete"), metadata);
    return { status: "success" as const, resultImageUrl: stored.url, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    if (error instanceof ComfyUiRemoteError && !(error instanceof ComfyUiTaskExecutionError)) {
      const alreadyWaiting = existingStages.some(stage => stage.key === "workstation_reconnect" && stage.state === "active");
      const stages = alreadyWaiting
        ? existingStages
        : advanceStage(existingStages, "workstation_reconnect", "Waiting for the Qwen workstation connection to recover");
      await updateTryOnTaskStages(historyId, stages, metadata);
      return { status: "pending" as const };
    }
    const legacyReservedCredits = task.creditsDeducted > 0 ? task.creditsDeducted : 0;
    const message = safeErrorMessage(error, legacyReservedCredits);
    console.error("[ComfyUI] Failed while refreshing Qwen task", { historyId, category: error instanceof ComfyUiConfigurationError ? "configuration" : "remote" });
    await failWithoutCharge(userId, historyId, existingStages, message, legacyReservedCredits, metadata);
    return { status: "failed" as const, message };
  }
}
