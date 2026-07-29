import { TRPCError } from "@trpc/server";
import {
  addCredits,
  getCreditCostForRoute,
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

function getStoredFailureMessage(stages: TryOnTaskStage[]): string | null {
  const failure = [...stages].reverse().find(stage => stage.state === "error" && typeof stage.detail === "string" && stage.detail.length > 0);
  return failure?.detail ?? null;
}

function getReservedCredits(creditsDeducted: number) {
  return creditsDeducted > 0 ? creditsDeducted : 0;
}

async function failWithoutCharge(userId: number, historyId: number, stages: TryOnTaskStage[], message: string, legacyReservedCredits: number = 0) {
  if (legacyReservedCredits > 0) {
    const refunded = await addCredits(userId, legacyReservedCredits);
    if (!refunded) console.error("[LocalBridge] Failed to refund legacy XXX reservation", { historyId, credits: legacyReservedCredits });
  }
  await updateTryOnTaskStages(historyId, failStages(stages, message));
  await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
}

function bridgeStageFromStatus(status: BridgeTaskStatus, stages: TryOnTaskStage[], label?: string | null, detail?: string | null): TryOnTaskStage[] {
  const activeStage = stages.at(-1);
  const existingActive = activeStage?.state === "active";
  if (status === "queued") {
    return existingActive ? stages : advanceStage(stages, "bridge_queue", "Waiting for the local Qwen workstation", "The paired workstation will collect this task when it is online.");
  }
  if (status === "leased") {
    const nextLabel = label || "Local Qwen workstation accepted the task";
    return activeStage?.key === "bridge_claimed" && activeStage.label === nextLabel && activeStage.detail === (detail ?? undefined)
      ? stages
      : advanceStage(stages, "bridge_claimed", nextLabel, detail ?? undefined);
  }
  if (status === "processing") {
    const nextLabel = label || "Qwen image edit is in progress";
    return activeStage?.key === "qwen_processing" && activeStage.label === nextLabel && activeStage.detail === (detail ?? undefined)
      ? stages
      : advanceStage(stages, "qwen_processing", nextLabel, detail ?? undefined);
  }
  return stages;
}

/** Creates a Qwen job that can only be claimed by an online, owner-paired local Bridge. */
export async function startLocalBridgeQwenTask(userId: number, photoId: number, positivePrompt?: string) {
  const device = await getActiveBridgeDevice();
  if (!device?.online) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The local Qwen workstation is offline. Start the paired Bridge before using XXX.",
    });
  }

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
    { key: "route_selected", label: "Local ComfyUI route selected", state: "completed", detail: `route=local-bridge-qwen; shirtStyle=${QWEN_EDIT_STYLE_ID}`, timestamp: Date.now() },
    { key: "photo_verified", label: "Photo ownership verified", state: "completed", timestamp: Date.now() },
    { key: "task_created", label: "XXX processing task created", state: "completed", timestamp: Date.now() },
  ];
  await updateTryOnTaskStages(historyId, stages);

  stages = advanceStage(stages, "credit_pending", `${creditCost} credit${creditCost === 1 ? "" : "s"} will be charged after completion`);
  await updateTryOnTaskStages(historyId, stages);

  try {
    const taskId = await createQueuedBridgeTask({
      historyId,
      userId,
      photoId,
      deviceId: device.id,
      workflowId: QWEN_EDIT_STYLE_ID,
      positivePrompt,
    });
    if (!taskId) throw new Error("Could not queue local Bridge task");

    stages = advanceStage(stages, "bridge_queue", "Waiting for the local Qwen workstation", "The paired workstation will collect this task shortly.");
    await updateTryOnTaskStages(historyId, stages);
    return { taskId: historyId, status: "pending" as const, creditsRemaining: balance, shirtApplied: QWEN_EDIT_STYLE_NAME };
  } catch (error) {
    const message = "The local Qwen task could not be queued. No credits were deducted.";
    console.error("[LocalBridge] Failed to queue Qwen task", { historyId, error: error instanceof Error ? error.message : "unknown" });
    await failWithoutCharge(userId, historyId, stages, message);
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
  const historyStages = parseStages(history.bubbleApiResponse);
  const reservedCredits = getReservedCredits(history.creditsDeducted);
  if (history.status === "failed") {
    const fallback = reservedCredits > 0
      ? `The XXX edit was not completed. Your ${reservedCredits} credits have been returned.`
      : "The XXX edit was not completed. No credits were deducted.";
    return { status: "failed" as const, message: getStoredFailureMessage(historyStages) ?? fallback };
  }

  const task = await getBridgeTaskByHistoryId(historyId);
  const initialStages = historyStages;
  if (!task) {
    const message = reservedCredits > 0
      ? `The XXX task could not be recovered. Your ${reservedCredits} credits have been returned.`
      : "The XXX task could not be recovered. No credits were deducted.";
    await failWithoutCharge(userId, historyId, initialStages, message, reservedCredits);
    return { status: "failed" as const, message };
  }

  let taskStatus = task.status;
  if (taskStatus === "leased" || taskStatus === "processing") {
    taskStatus = (await requeueExpiredBridgeTask(task.id)) ?? taskStatus;
  }

  if (taskStatus === "failed") {
    const fallback = reservedCredits > 0
      ? `The local Qwen workstation could not complete this edit. Your ${reservedCredits} credits have been returned.`
      : "The local Qwen workstation could not complete this edit. No credits were deducted.";
    const message = task.lastError || fallback;
    await failWithoutCharge(userId, historyId, initialStages, message, reservedCredits);
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
  return {
    status: "pending" as const,
    stages: nextStages,
    estimatedSecondsRemaining: task.estimatedSecondsRemaining,
  };
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
  await failWithoutCharge(userId, historyId, parseStages(history.bubbleApiResponse), message, getReservedCredits(history.creditsDeducted));
}
