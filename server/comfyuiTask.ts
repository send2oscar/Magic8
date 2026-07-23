import { TRPCError } from "@trpc/server";
import {
  addCredits,
  deductCredits,
  getComfyUiTaskMetadata,
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
  downloadApprovedQwenOutput,
  getApprovedQwenOutput,
  submitApprovedQwenEdit,
} from "./comfyui";
import { QWEN_EDIT_STYLE_ID, QWEN_EDIT_STYLE_NAME } from "./comfyuiQwenWorkflow";
import { storagePut } from "./storage";

const MAX_QWEN_QUEUE_AGE_MS = 10 * 60 * 1_000;

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

function completeStage(stages: TryOnTaskStage[], key: string, label: string): TryOnTaskStage[] {
  const next = stages.map(stage => stage.state === "active" ? { ...stage, state: "completed" as const } : stage);
  return [...next, { key, label, state: "completed", timestamp: Date.now() }];
}

function failStages(stages: TryOnTaskStage[], message: string): TryOnTaskStage[] {
  const next = stages.map(stage => stage.state === "active" ? { ...stage, state: "error" as const, detail: message } : stage);
  return [...next, { key: "failed", label: "Qwen edit could not be completed", state: "error", detail: message, timestamp: Date.now() }];
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ComfyUiConfigurationError) {
    return "The Qwen workstation connection is not ready yet. Your credit has been returned.";
  }
  return "The Qwen edit could not be completed. Your credit has been returned.";
}

async function refundAndFail(
  userId: number,
  historyId: number,
  stages: TryOnTaskStage[],
  message: string,
  metadata?: ComfyUiTaskMetadata,
) {
  const refunded = await addCredits(userId, 1);
  if (!refunded) console.error("[ComfyUI] Failed to refund credit for task", historyId);
  await updateTryOnTaskStages(historyId, failStages(stages, message), metadata);
  await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
}

/** Creates a durable Qwen task; no workflow or prompt may be supplied by the browser. */
export async function startApprovedQwenTask(userId: number, photoId: number) {
  const balance = await getUserCredits(userId);
  if (balance < 1) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits. You need at least 1 credit to use XXX." });
  }

  const photo = (await getUserPhotos(userId)).find(candidate => candidate.id === photoId);
  if (!photo?.photoKey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "The selected photo was not found in your account. Upload a photo and try again." });
  }

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
    { key: "photo_verified", label: "Photo ownership verified", state: "completed", timestamp: Date.now() },
    { key: "task_created", label: "XXX processing task created", state: "completed", timestamp: Date.now() },
  ];
  await updateTryOnTaskStages(historyId, stages);

  const deducted = await deductCredits(userId, 1);
  if (!deducted) {
    await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to reserve a credit for XXX." });
  }

  try {
    stages = advanceStage(stages, "workstation_check", "Checking Qwen workstation connection");
    await updateTryOnTaskStages(historyId, stages);
    await checkComfyUiConnection();

    stages = advanceStage(stages, "source_upload", "Sending the selected photo to Qwen");
    await updateTryOnTaskStages(historyId, stages);
    const job = await submitApprovedQwenEdit(photo.photoKey);
    const metadata: ComfyUiTaskMetadata = {
      kind: QWEN_EDIT_STYLE_ID,
      promptId: job.promptId,
      uploadedFilename: job.uploadedFilename,
      queuedAt: Date.now(),
    };
    stages = advanceStage(stages, "qwen_queued", "Qwen image edit is in progress", "Your result will appear automatically when it is ready.");
    await updateTryOnTaskStages(historyId, stages, metadata);

    return { taskId: historyId, status: "pending" as const, creditsRemaining: balance - 1, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error("[ComfyUI] Failed to start Qwen task", { historyId, category: error instanceof ComfyUiConfigurationError ? "configuration" : "remote" });
    await refundAndFail(userId, historyId, stages, message);
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
    const message = "The Qwen task could not be recovered. Your credit has been returned.";
    await refundAndFail(userId, historyId, existingStages, message);
    return { status: "failed" as const, message };
  }

  if (Date.now() - metadata.queuedAt > MAX_QWEN_QUEUE_AGE_MS) {
    const message = "The Qwen workstation did not finish in time. Your credit has been returned.";
    await refundAndFail(userId, historyId, existingStages, message, metadata);
    return { status: "failed" as const, message };
  }

  try {
    const output = await getApprovedQwenOutput(metadata.promptId);
    if (!output) {
      const stages = advanceStage(existingStages, "qwen_waiting", "Waiting for Qwen to finish");
      await updateTryOnTaskStages(historyId, stages, metadata);
      return { status: "pending" as const };
    }

    const stages = advanceStage(existingStages, "result_saving", "Saving generated result");
    await updateTryOnTaskStages(historyId, stages, metadata);
    const result = await downloadApprovedQwenOutput(output);
    const extension = output.filename.split(".").pop()?.toLowerCase() || "jpg";
    const stored = await storagePut(`comfyui-results/${userId}/${historyId}.${extension}`, result.data, result.contentType);
    await updateTryOnHistory(historyId, { status: "success", resultImageUrl: stored.url, resultImageKey: stored.key, creditsDeducted: 1 });
    await updateTryOnTaskStages(historyId, completeStage(stages, "completed", "XXX edit complete"), metadata);
    return { status: "success" as const, resultImageUrl: stored.url, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    if (error instanceof ComfyUiRemoteError && Date.now() - metadata.queuedAt <= MAX_QWEN_QUEUE_AGE_MS) {
      const alreadyWaiting = existingStages.some(stage => stage.key === "workstation_reconnect" && stage.state === "active");
      const stages = alreadyWaiting
        ? existingStages
        : advanceStage(existingStages, "workstation_reconnect", "Waiting for the Qwen workstation connection to recover");
      await updateTryOnTaskStages(historyId, stages, metadata);
      return { status: "pending" as const };
    }
    const message = safeErrorMessage(error);
    console.error("[ComfyUI] Failed while refreshing Qwen task", { historyId, category: error instanceof ComfyUiConfigurationError ? "configuration" : "remote" });
    await refundAndFail(userId, historyId, existingStages, message, metadata);
    return { status: "failed" as const, message };
  }
}
