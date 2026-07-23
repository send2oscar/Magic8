import { TRPCError } from "@trpc/server";
import {
  addCredits,
  deductCredits,
  getUserCredits,
  getUserPhotos,
  getUserTryOnTask,
  saveTryOnHistory,
  type TryOnTaskStage,
  updateTryOnHistory,
  updateTryOnTaskStages,
} from "./db";
import {
  createQueuedBridgeTask,
  getActiveBridgeDevice,
  getBridgeTaskByHistoryId,
  requeueExpiredBridgeTask,
  type BridgeTaskStatus,
} from "./bridgeDb";
import { QWEN_EDIT_STYLE_ID, QWEN_EDIT_STYLE_NAME } from "./comfyuiQwenWorkflow";

function getInsertedHistoryId(result: unknown): number | null {
  const candidates = Array.isArray(result) ? result : [result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const insertId = Number((candidate as { insertId?: unknown }).insertId);
    if (Number.isSafeInteger(insertId) && insertId > 0) return insertId;
  }
  return null;
}

function parseStages(serialized: string | null): TryOnTaskStage[] {
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
  return [...next, { key: "failed", label: "XXX edit could not be completed", state: "error", detail: message, timestamp: Date.now() }];
}

async function refundAndFail(userId: number, historyId: number, stages: TryOnTaskStage[], message: string) {
  const refunded = await addCredits(userId, 1);
  if (!refunded) console.error("[LocalBridge] Failed to refund credit", { historyId });
  await updateTryOnTaskStages(historyId, failStages(stages, message));
  await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
}

function bridgeStageFromStatus(status: BridgeTaskStatus, stages: TryOnTaskStage[], label?: string | null, detail?: string | null): TryOnTaskStage[] {
  const existingActive = stages.at(-1)?.state === "active";
  if (status === "queued") {
    return existingActive ? stages : advanceStage(stages, "bridge_queue", "Waiting for the local Qwen workstation", "The paired workstation will collect this task when it is online.");
  }
  if (status === "leased") {
    return advanceStage(stages, "bridge_claimed", label || "Local Qwen workstation accepted the task", detail ?? undefined);
  }
  if (status === "processing") {
    return advanceStage(stages, "qwen_processing", label || "Qwen image edit is in progress", detail ?? undefined);
  }
  return stages;
}

/** Creates a Qwen job that can only be claimed by an online, owner-paired local Bridge. */
export async function startLocalBridgeQwenTask(userId: number, photoId: number) {
  const device = await getActiveBridgeDevice();
  if (!device?.online) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The local Qwen workstation is offline. Start the paired Bridge before using XXX.",
    });
  }

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
  if (!historyId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create the XXX task." });

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
    const taskId = await createQueuedBridgeTask({
      historyId,
      userId,
      photoId,
      deviceId: device.id,
      workflowId: QWEN_EDIT_STYLE_ID,
    });
    if (!taskId) throw new Error("Could not queue local Bridge task");

    stages = advanceStage(stages, "bridge_queue", "Waiting for the local Qwen workstation", "The paired workstation will collect this task shortly.");
    await updateTryOnTaskStages(historyId, stages);
    return { taskId: historyId, status: "pending" as const, creditsRemaining: balance - 1, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    const message = "The local Qwen task could not be queued. Your credit has been returned.";
    console.error("[LocalBridge] Failed to queue Qwen task", { historyId, error: error instanceof Error ? error.message : "unknown" });
    await refundAndFail(userId, historyId, stages, message);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}

/** Returns a user-safe task view and requeues one expired local workstation lease when eligible. */
export async function refreshLocalBridgeQwenTask(userId: number, historyId: number) {
  const history = await getUserTryOnTask(userId, historyId);
  if (!history || history.shirtStyle !== QWEN_EDIT_STYLE_ID) {
    throw new TRPCError({ code: "NOT_FOUND", message: "The requested XXX task was not found." });
  }
  if (history.status === "success") {
    return { status: "success" as const, resultImageUrl: history.resultImageUrl, shirtApplied: QWEN_EDIT_STYLE_NAME };
  }
  if (history.status === "failed") {
    return { status: "failed" as const, message: "The XXX edit was not completed. Your credit has been returned." };
  }

  const task = await getBridgeTaskByHistoryId(historyId);
  const initialStages = parseStages(history.bubbleApiResponse);
  if (!task) {
    const message = "The XXX task could not be recovered. Your credit has been returned.";
    await refundAndFail(userId, historyId, initialStages, message);
    return { status: "failed" as const, message };
  }

  let taskStatus = task.status;
  if (taskStatus === "leased" || taskStatus === "processing") {
    taskStatus = (await requeueExpiredBridgeTask(task.id)) ?? taskStatus;
  }

  if (taskStatus === "failed") {
    const message = "The local Qwen workstation could not complete this edit. Your credit has been returned.";
    await refundAndFail(userId, historyId, initialStages, message);
    return { status: "failed" as const, message };
  }
  if (taskStatus === "completed") {
    const message = "The XXX result is being finalized. Please refresh in a moment.";
    return { status: "pending" as const, message };
  }

  const nextStages = bridgeStageFromStatus(taskStatus, initialStages, task.progressLabel, task.progressDetail);
  if (JSON.stringify(nextStages) !== JSON.stringify(initialStages)) {
    await updateTryOnTaskStages(historyId, nextStages);
  }
  return { status: "pending" as const };
}

export function buildCompletedBridgeStages(existingStages: TryOnTaskStage[]): TryOnTaskStage[] {
  return completeStage(existingStages, "completed", "XXX edit complete");
}

export function parseLocalBridgeStages(serialized: string | null): TryOnTaskStage[] {
  return parseStages(serialized);
}

export async function failLocalBridgeTaskForUser(userId: number, historyId: number, message: string) {
  const history = await getUserTryOnTask(userId, historyId);
  if (!history || history.status !== "pending") return;
  await refundAndFail(userId, historyId, parseStages(history.bubbleApiResponse), message);
}
