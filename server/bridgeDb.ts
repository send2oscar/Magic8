import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import {
  comfyBridgeDevices,
  comfyBridgePairings,
  comfyBridgeTasks,
  userPhotos,
} from "../drizzle/schema";
import { getDb } from "./db";

export const BRIDGE_PAIRING_TTL_MS = 10 * 60 * 1_000;
export const BRIDGE_ONLINE_WINDOW_MS = 90 * 1_000;
export const BRIDGE_LEASE_TTL_MS = 5 * 60 * 1_000;
export const BRIDGE_MAX_ATTEMPTS = 3;

export type BridgeTaskStatus = "queued" | "leased" | "processing" | "completed" | "failed";

export type BridgeDeviceStatus = {
  id: number;
  label: string;
  online: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type ClaimedBridgeTask = {
  id: number;
  historyId: number;
  userId: number;
  photoId: number;
  photoKey: string;
  workflowId: string;
  leaseCredential: string;
  leaseExpiresAt: Date;
};

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generateSecret(byteLength: number = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

function wasUpdated(result: unknown): boolean {
  const candidate = Array.isArray(result) ? result[0] : result;
  return typeof candidate === "object" && candidate !== null && Number((candidate as { affectedRows?: unknown }).affectedRows) > 0;
}

export async function createBridgePairing(ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const code = generateSecret(18).toUpperCase();
  const expiresAt = new Date(Date.now() + BRIDGE_PAIRING_TTL_MS);
  await db.insert(comfyBridgePairings).values({
    ownerUserId,
    codeHash: hashSecret(code),
    expiresAt,
  });

  return { code, expiresAt };
}

/** Consumes a single-use code and returns a plaintext credential exactly once. */
export async function consumeBridgePairing(code: string, label: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const normalizedCode = code.trim().toUpperCase();
  const rows = await db
    .select()
    .from(comfyBridgePairings)
    .where(and(
      eq(comfyBridgePairings.codeHash, hashSecret(normalizedCode)),
      isNull(comfyBridgePairings.consumedAt),
      gt(comfyBridgePairings.expiresAt, new Date()),
    ))
    .limit(1);
  const pairing = rows[0];
  if (!pairing) return null;

  const consumed = await db
    .update(comfyBridgePairings)
    .set({ consumedAt: new Date() })
    .where(and(eq(comfyBridgePairings.id, pairing.id), isNull(comfyBridgePairings.consumedAt)));
  if (!wasUpdated(consumed)) return null;

  const credential = generateSecret(32);
  const inserted = await db.insert(comfyBridgeDevices).values({
    ownerUserId: pairing.ownerUserId,
    label: label.trim().slice(0, 120) || "ComfyUI workstation",
    credentialHash: hashSecret(credential),
    status: "active",
    lastSeenAt: new Date(),
  });
  const insertedId = Number((Array.isArray(inserted) ? inserted[0] : inserted as { insertId?: unknown }).insertId);
  if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
    throw new Error("Could not register the local Bridge");
  }

  return { deviceId: insertedId, ownerUserId: pairing.ownerUserId, credential };
}

export async function getBridgeDeviceFromCredential(credential: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(comfyBridgeDevices)
    .where(and(
      eq(comfyBridgeDevices.credentialHash, hashSecret(credential)),
      eq(comfyBridgeDevices.status, "active"),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchBridgeDevice(deviceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(comfyBridgeDevices).set({ lastSeenAt: new Date() }).where(eq(comfyBridgeDevices.id, deviceId));
}

export async function getLatestActiveBridgeDevice(ownerUserId: number): Promise<BridgeDeviceStatus | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: comfyBridgeDevices.id,
      label: comfyBridgeDevices.label,
      lastSeenAt: comfyBridgeDevices.lastSeenAt,
      createdAt: comfyBridgeDevices.createdAt,
    })
    .from(comfyBridgeDevices)
    .where(and(eq(comfyBridgeDevices.ownerUserId, ownerUserId), eq(comfyBridgeDevices.status, "active")))
    .orderBy(desc(comfyBridgeDevices.id))
    .limit(1);
  const device = rows[0];
  if (!device) return null;
  return {
    ...device,
    online: Boolean(device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() <= BRIDGE_ONLINE_WINDOW_MS),
  };
}

/** The newest active owner-paired Bridge services all customer XXX tasks. */
export async function getActiveBridgeDevice(): Promise<BridgeDeviceStatus | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: comfyBridgeDevices.id,
      label: comfyBridgeDevices.label,
      lastSeenAt: comfyBridgeDevices.lastSeenAt,
      createdAt: comfyBridgeDevices.createdAt,
    })
    .from(comfyBridgeDevices)
    .where(eq(comfyBridgeDevices.status, "active"))
    .orderBy(desc(comfyBridgeDevices.id))
    .limit(1);
  const device = rows[0];
  if (!device) return null;
  return {
    ...device,
    online: Boolean(device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() <= BRIDGE_ONLINE_WINDOW_MS),
  };
}

export async function createQueuedBridgeTask(input: {
  historyId: number;
  userId: number;
  photoId: number;
  deviceId: number;
  workflowId: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(comfyBridgeTasks).values({
    ...input,
    status: "queued",
    attemptCount: 0,
  });
  const insertedId = Number((Array.isArray(result) ? result[0] : result as { insertId?: unknown }).insertId);
  return Number.isSafeInteger(insertedId) && insertedId > 0 ? insertedId : null;
}

/**
 * Reserves the oldest queued task for a device and issues a short-lived lease
 * credential. A conditional update protects against concurrent Bridge polls.
 */
export async function claimNextBridgeTask(deviceId: number): Promise<ClaimedBridgeTask | null> {
  const db = await getDb();
  if (!db) return null;

  const candidates = await db
    .select({
      id: comfyBridgeTasks.id,
      historyId: comfyBridgeTasks.historyId,
      userId: comfyBridgeTasks.userId,
      photoId: comfyBridgeTasks.photoId,
      workflowId: comfyBridgeTasks.workflowId,
      photoKey: userPhotos.photoKey,
    })
    .from(comfyBridgeTasks)
    .innerJoin(userPhotos, and(eq(userPhotos.id, comfyBridgeTasks.photoId), eq(userPhotos.userId, comfyBridgeTasks.userId)))
    .where(and(eq(comfyBridgeTasks.deviceId, deviceId), eq(comfyBridgeTasks.status, "queued")))
    .orderBy(comfyBridgeTasks.createdAt)
    .limit(1);
  const candidate = candidates[0];
  if (!candidate?.photoKey) return null;

  const leaseCredential = generateSecret(32);
  const leaseExpiresAt = new Date(Date.now() + BRIDGE_LEASE_TTL_MS);
  const updated = await db
    .update(comfyBridgeTasks)
    .set({
      status: "leased",
      leaseHash: hashSecret(leaseCredential),
      leaseExpiresAt,
      attemptCount: sql`${comfyBridgeTasks.attemptCount} + 1`,
      progressKey: "bridge_claimed",
      progressLabel: "Local Qwen workstation accepted the task",
      progressDetail: null,
    })
    .where(and(eq(comfyBridgeTasks.id, candidate.id), eq(comfyBridgeTasks.status, "queued")));
  if (!wasUpdated(updated)) return null;

  return { ...candidate, leaseCredential, leaseExpiresAt };
}

export async function validateBridgeTaskLease(taskId: number, deviceId: number, leaseCredential: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(comfyBridgeTasks)
    .where(and(
      eq(comfyBridgeTasks.id, taskId),
      eq(comfyBridgeTasks.deviceId, deviceId),
      eq(comfyBridgeTasks.leaseHash, hashSecret(leaseCredential)),
      gt(comfyBridgeTasks.leaseExpiresAt, new Date()),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateBridgeTaskProgress(input: {
  taskId: number;
  deviceId: number;
  leaseCredential: string;
  status?: Extract<BridgeTaskStatus, "leased" | "processing">;
  progressKey: string;
  progressLabel: string;
  progressDetail?: string | null;
  promptId?: string | null;
}): Promise<boolean> {
  const task = await validateBridgeTaskLease(input.taskId, input.deviceId, input.leaseCredential);
  if (!task) return false;
  const db = await getDb();
  if (!db) return false;
  const leaseExpiresAt = new Date(Date.now() + BRIDGE_LEASE_TTL_MS);
  const updated = await db
    .update(comfyBridgeTasks)
    .set({
      status: input.status ?? "processing",
      progressKey: input.progressKey.slice(0, 100),
      progressLabel: input.progressLabel.slice(0, 255),
      progressDetail: input.progressDetail?.slice(0, 2_000) ?? null,
      promptId: input.promptId?.slice(0, 128) ?? task.promptId,
      leaseExpiresAt,
    })
    .where(eq(comfyBridgeTasks.id, input.taskId));
  return wasUpdated(updated);
}

export async function completeBridgeTaskLease(taskId: number, deviceId: number, leaseCredential: string): Promise<boolean> {
  const task = await validateBridgeTaskLease(taskId, deviceId, leaseCredential);
  if (!task) return false;
  const db = await getDb();
  if (!db) return false;
  const updated = await db
    .update(comfyBridgeTasks)
    .set({
      status: "completed",
      progressKey: "completed",
      progressLabel: "XXX edit complete",
      progressDetail: null,
      leaseHash: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    })
    .where(eq(comfyBridgeTasks.id, taskId));
  return wasUpdated(updated);
}

export async function failBridgeTaskLease(input: {
  taskId: number;
  deviceId: number;
  leaseCredential: string;
  message: string;
}): Promise<boolean> {
  const task = await validateBridgeTaskLease(input.taskId, input.deviceId, input.leaseCredential);
  if (!task) return false;
  const db = await getDb();
  if (!db) return false;
  const updated = await db
    .update(comfyBridgeTasks)
    .set({
      status: "failed",
      progressKey: "failed",
      progressLabel: "XXX edit failed",
      progressDetail: null,
      lastError: input.message.slice(0, 500),
      leaseHash: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    })
    .where(eq(comfyBridgeTasks.id, input.taskId));
  return wasUpdated(updated);
}

export async function getBridgeTaskByHistoryId(historyId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(comfyBridgeTasks).where(eq(comfyBridgeTasks.historyId, historyId)).limit(1);
  return rows[0] ?? null;
}

export async function getBridgeTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(comfyBridgeTasks).where(eq(comfyBridgeTasks.id, taskId)).limit(1);
  return rows[0] ?? null;
}

/** Requeues one expired lease for retry. The caller decides when to refund after the retry limit. */
export async function requeueExpiredBridgeTask(taskId: number): Promise<BridgeTaskStatus | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(comfyBridgeTasks).where(eq(comfyBridgeTasks.id, taskId)).limit(1);
  const task = rows[0];
  if (!task) return null;
  if ((task.status !== "leased" && task.status !== "processing") || !task.leaseExpiresAt || task.leaseExpiresAt > new Date()) {
    return task.status;
  }
  if (task.attemptCount >= BRIDGE_MAX_ATTEMPTS) return task.status;
  const updated = await db
    .update(comfyBridgeTasks)
    .set({
      status: "queued",
      leaseHash: null,
      leaseExpiresAt: null,
      progressKey: "bridge_reconnecting",
      progressLabel: "Waiting for the local Qwen workstation to resume",
      progressDetail: null,
    })
    .where(and(eq(comfyBridgeTasks.id, taskId), eq(comfyBridgeTasks.status, task.status)));
  return wasUpdated(updated) ? "queued" : null;
}
