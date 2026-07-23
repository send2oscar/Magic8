import type { Request, Response } from "express";
import { getPendingDirectComfyUiTasks } from "./db";
import { refreshApprovedQwenTask } from "./comfyuiTask";
import { sdk } from "./_core/sdk";

/**
 * Heartbeat-only callback. It makes durable XXX completion independent of an
 * open Dashboard tab, processing a deliberately small batch per invocation.
 */
export async function finalizePendingComfyUiTasks(req: Request, res: Response) {
  try {
    const caller = await sdk.authenticateRequest(req);
    if (!caller.isCron || !caller.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const tasks = await getPendingDirectComfyUiTasks(5);
    const outcomes = await Promise.allSettled(
      tasks.map(async task => ({ taskId: task.id, result: await refreshApprovedQwenTask(task.userId, task.id) })),
    );
    const finalized = outcomes.filter(outcome => outcome.status === "fulfilled" && outcome.value.result.status !== "pending").length;
    const errors = outcomes.filter(outcome => outcome.status === "rejected").length;
    return res.json({ ok: true, checked: tasks.length, finalized, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ComfyUI scheduled finalizer] Failed:", error);
    return res.status(500).json({ error: message, context: { route: "comfyui-finalize" }, timestamp: new Date().toISOString() });
  }
}
