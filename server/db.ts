import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  userPhotos,
  InsertUserPhoto,
  tryOnHistory,
  InsertTryOnHistory,
  comfyBridgeTasks,
  creditPackages,
  creditPolicies,
  paypalPayments,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { QWEN_EDIT_STYLE_ID, type QwenLoraWeights } from "./comfyuiQwenWorkflow";
import { getStoredTaskRouteDiagnostic } from "./taskRouteDiagnostics";
import {
  assertValidCreditPolicy,
  assertValidPackageCredits,
  calculatePackagePriceCents,
  INITIAL_CREDIT_POLICY,
  type EditableCreditPolicy,
} from "./creditPolicy";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get user credits balance
 */
export async function getUserCredits(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get credits: database not available");
    return 0;
  }

  const result = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0].credits : 0;
}

export type StoredCreditPolicy = EditableCreditPolicy & {
  id: number;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

async function ensureCreditPolicy() {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(creditPolicies).orderBy(asc(creditPolicies.id)).limit(1);
  if (existing[0]) return existing[0];

  try {
    await db.insert(creditPolicies).values({ id: 1, ...INITIAL_CREDIT_POLICY });
  } catch {
    // Another request may have seeded the singleton at the same time.
  }
  const seeded = await db.select().from(creditPolicies).orderBy(asc(creditPolicies.id)).limit(1);
  return seeded[0] ?? null;
}

/** Return the singleton administrator-managed credit policy. */
export async function getCreditPolicy(): Promise<StoredCreditPolicy | null> {
  try {
    return await ensureCreditPolicy();
  } catch (error) {
    console.error("[Database] Failed to get credit policy:", error);
    return null;
  }
}

export async function updateCreditPolicy(
  policy: EditableCreditPolicy,
  updatedByUserId: number | null,
): Promise<StoredCreditPolicy | null> {
  assertValidCreditPolicy(policy);
  const db = await getDb();
  if (!db) return null;
  const current = await ensureCreditPolicy();
  if (!current) return null;
  try {
    await db.update(creditPolicies)
      .set({ ...policy, updatedByUserId })
      .where(eq(creditPolicies.id, current.id));
    return await getCreditPolicy();
  } catch (error) {
    console.error("[Database] Failed to update credit policy:", error);
    return null;
  }
}

export async function getCreditCostForRoute(route: "standard" | "xxx") {
  const policy = await getCreditPolicy();
  if (!policy) return null;
  return route === "xxx" ? policy.xxxTryOnCredits : policy.standardTryOnCredits;
}

export async function getActiveCreditPackages() {
  const db = await getDb();
  if (!db) return [];
  try {
    const policy = await getCreditPolicy();
    if (!policy) return [];
    const packages = await db.select().from(creditPackages)
      .where(eq(creditPackages.status, "active"))
      .orderBy(asc(creditPackages.sortOrder), asc(creditPackages.id));
    return packages.map((creditPackage) => ({
      ...creditPackage,
      priceCents: calculatePackagePriceCents(creditPackage.credits, policy.priceCentsPerTenCredits),
    }));
  } catch (error) {
    console.error("[Database] Failed to get active credit packages:", error);
    return [];
  }
}

export async function getAdminCreditPackages() {
  const db = await getDb();
  if (!db) return [];
  try {
    const policy = await getCreditPolicy();
    if (!policy) return [];
    const packages = await db.select().from(creditPackages)
      .orderBy(asc(creditPackages.sortOrder), asc(creditPackages.id));
    return packages.map((creditPackage) => ({
      ...creditPackage,
      priceCents: calculatePackagePriceCents(creditPackage.credits, policy.priceCentsPerTenCredits),
    }));
  } catch (error) {
    console.error("[Database] Failed to get admin credit packages:", error);
    return [];
  }
}

export async function getCreditPackageById(packageId: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(creditPackages)
      .where(and(eq(creditPackages.id, packageId), eq(creditPackages.status, "active")))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to get credit package:", error);
    return null;
  }
}

export async function saveAdminCreditPackage(input: {
  id?: number;
  credits: number;
  status: "active" | "inactive";
  sortOrder: number;
}) {
  assertValidPackageCredits(input.credits);
  if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 100_000) {
    throw new Error("Package sort order must be a whole number between 0 and 100000.");
  }
  const db = await getDb();
  if (!db) return null;
  try {
    if (input.id) {
      await db.update(creditPackages)
        .set({ credits: input.credits, status: input.status, sortOrder: input.sortOrder })
        .where(eq(creditPackages.id, input.id));
      const updated = await db.select().from(creditPackages).where(eq(creditPackages.id, input.id)).limit(1);
      return updated[0] ?? null;
    }
    const inserted = await db.insert(creditPackages).values({
      credits: input.credits,
      status: input.status,
      sortOrder: input.sortOrder,
    });
    const header = Array.isArray(inserted) ? inserted[0] : inserted;
    const insertId = Number((header as { insertId?: unknown }).insertId);
    if (!Number.isSafeInteger(insertId) || insertId <= 0) return null;
    const created = await db.select().from(creditPackages).where(eq(creditPackages.id, insertId)).limit(1);
    return created[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to save credit package:", error);
    return null;
  }
}

export async function getPackagePriceCents(creditAmount: number) {
  const policy = await getCreditPolicy();
  if (!policy) return null;
  return calculatePackagePriceCents(creditAmount, policy.priceCentsPerTenCredits);
}

export async function createPaypalPaymentRecord(input: {
  userId: number;
  packageId: number;
  orderId: string;
  creditAmount: number;
  expectedAmountCents: number;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(paypalPayments).values({
      userId: input.userId,
      packageId: input.packageId,
      orderId: input.orderId,
      creditAmount: input.creditAmount,
      expectedAmountCents: input.expectedAmountCents,
      status: "created",
    });
    const header = Array.isArray(result) ? result[0] : result;
    const insertId = Number((header as { insertId?: unknown }).insertId);
    if (!Number.isSafeInteger(insertId) || insertId <= 0) return null;
    const rows = await db.select().from(paypalPayments).where(eq(paypalPayments.id, insertId)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to create PayPal payment record:", error);
    return null;
  }
}

export async function getPaypalPaymentForUser(userId: number, orderId: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(paypalPayments)
      .where(and(eq(paypalPayments.userId, userId), eq(paypalPayments.orderId, orderId)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to get PayPal payment:", error);
    return null;
  }
}

export async function markPaypalPaymentStatus(
  userId: number,
  orderId: string,
  status: "failed" | "cancelled",
  failureDetail?: string,
) {
  const db = await getDb();
  if (!db) return false;
  try {
    const result = await db.update(paypalPayments)
      .set({ status, failureDetail: failureDetail?.slice(0, 4_000) ?? null })
      .where(and(
        eq(paypalPayments.userId, userId),
        eq(paypalPayments.orderId, orderId),
        eq(paypalPayments.status, "created"),
      ));
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: unknown }).affectedRows ?? 0) === 1;
  } catch (error) {
    console.error("[Database] Failed to update PayPal payment status:", error);
    return false;
  }
}

export type PaypalFulfillmentResult = {
  status: "completed" | "already_completed" | "amount_mismatch" | "not_found" | "not_capturable";
  creditAmount?: number;
};

/**
 * Idempotently mark a verified PayPal capture complete and add its recorded
 * package credits in the same transaction. Browser-provided amounts are never
 * accepted: `capturedAmountCents` must match the server-created order record.
 */
export async function fulfillPaypalPayment(input: {
  userId: number;
  orderId: string;
  captureId: string;
  capturedAmountCents: number;
}): Promise<PaypalFulfillmentResult | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx.select().from(paypalPayments)
        .where(and(eq(paypalPayments.userId, input.userId), eq(paypalPayments.orderId, input.orderId)))
        .limit(1);
      const payment = rows[0];
      if (!payment) return { status: "not_found" };
      if (payment.status === "completed") {
        return { status: "already_completed", creditAmount: payment.creditAmount };
      }
      if (payment.status !== "created") return { status: "not_capturable" };
      if (payment.expectedAmountCents !== input.capturedAmountCents) {
        await tx.update(paypalPayments)
          .set({ status: "failed", failureDetail: "Captured USD amount did not match the server-created order." })
          .where(and(eq(paypalPayments.id, payment.id), eq(paypalPayments.status, "created")));
        return { status: "amount_mismatch" };
      }

      const paymentUpdate = await tx.update(paypalPayments)
        .set({ status: "completed", captureId: input.captureId, capturedAt: new Date(), failureDetail: null })
        .where(and(eq(paypalPayments.id, payment.id), eq(paypalPayments.status, "created")));
      const paymentHeader = Array.isArray(paymentUpdate) ? paymentUpdate[0] : paymentUpdate;
      if (Number((paymentHeader as { affectedRows?: unknown }).affectedRows ?? 0) !== 1) {
        return { status: "not_capturable" };
      }

      const creditUpdate = await tx.update(users)
        .set({ credits: sql`${users.credits} + ${payment.creditAmount}` })
        .where(eq(users.id, input.userId));
      const creditHeader = Array.isArray(creditUpdate) ? creditUpdate[0] : creditUpdate;
      if (Number((creditHeader as { affectedRows?: unknown }).affectedRows ?? 0) !== 1) {
        throw new Error("The credited user account was not found.");
      }
      return { status: "completed", creditAmount: payment.creditAmount };
    });
  } catch (error) {
    console.error("[Database] Failed to fulfill PayPal payment:", error);
    return null;
  }
}

export async function getAdminPaypalPayments(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select({
      id: paypalPayments.id,
      orderId: paypalPayments.orderId,
      captureId: paypalPayments.captureId,
      creditAmount: paypalPayments.creditAmount,
      expectedAmountCents: paypalPayments.expectedAmountCents,
      status: paypalPayments.status,
      createdAt: paypalPayments.createdAt,
      capturedAt: paypalPayments.capturedAt,
      username: users.name,
      email: users.email,
    })
      .from(paypalPayments)
      .leftJoin(users, eq(users.id, paypalPayments.userId))
      .orderBy(desc(paypalPayments.createdAt))
      .limit(Math.min(Math.max(limit, 1), 250));
  } catch (error) {
    console.error("[Database] Failed to get administrator PayPal payments:", error);
    return [];
  }
}

/**
 * Deduct credits from user (for try-on feature)
 */
export async function deductCredits(userId: number, amount: number = 1): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot deduct credits: database not available");
    return false;
  }

  try {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    const result = await db
      .update(users)
      .set({ credits: sql`${users.credits} - ${amount}` })
      .where(and(eq(users.id, userId), sql`${users.credits} >= ${amount}`));
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: unknown }).affectedRows ?? 0) === 1;
  } catch (error) {
    console.error("[Database] Failed to deduct credits:", error);
    return false;
  }
}

export type CompleteTryOnChargeInput = {
  userId: number;
  historyId: number;
  creditCost: number;
  resultImageUrl: string;
  resultImageKey?: string | null;
};

export type CompleteTryOnChargeResult = "charged" | "insufficient_credits" | "already_finalized" | "error";

class TryOnAlreadyFinalizedError extends Error {
  constructor() {
    super("The try-on task was already finalized.");
    this.name = "TryOnAlreadyFinalizedError";
  }
}

/**
 * Charge a user only when their generated image is ready to become a Gallery result.
 * The balance debit and pending-to-success transition share one database transaction,
 * preventing concurrent pollers from charging the same task twice.
 */
export async function chargeAndCompleteTryOn(input: CompleteTryOnChargeInput): Promise<CompleteTryOnChargeResult> {
  const db = await getDb();
  if (!db || !Number.isSafeInteger(input.creditCost) || input.creditCost <= 0) return "error";

  try {
    return await db.transaction(async tx => {
      const debit = await tx
        .update(users)
        .set({ credits: sql`${users.credits} - ${input.creditCost}` })
        .where(and(eq(users.id, input.userId), sql`${users.credits} >= ${input.creditCost}`));
      const debitHeader = Array.isArray(debit) ? debit[0] : debit;
      if (Number((debitHeader as { affectedRows?: unknown }).affectedRows ?? 0) !== 1) {
        return "insufficient_credits" as const;
      }

      const finalized = await tx
        .update(tryOnHistory)
        .set({
          status: "success",
          resultImageUrl: input.resultImageUrl,
          resultImageKey: input.resultImageKey ?? null,
          creditsDeducted: input.creditCost,
          completedAt: new Date(),
        })
        .where(and(eq(tryOnHistory.id, input.historyId), eq(tryOnHistory.status, "pending")));
      const finalizedHeader = Array.isArray(finalized) ? finalized[0] : finalized;
      if (Number((finalizedHeader as { affectedRows?: unknown }).affectedRows ?? 0) !== 1) {
        throw new TryOnAlreadyFinalizedError();
      }

      return "charged" as const;
    });
  } catch (error) {
    if (error instanceof TryOnAlreadyFinalizedError) return "already_finalized";
    console.error("[Database] Failed to charge and finalize try-on:", error);
    return "error";
  }
}

/**
 * Add credits to user
 */
export async function addCredits(userId: number, amount: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot add credits: database not available");
    return false;
  }

  try {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    const result = await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}` })
      .where(eq(users.id, userId));
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: unknown }).affectedRows ?? 0) === 1;
  } catch (error) {
    console.error("[Database] Failed to add credits:", error);
    return false;
  }
}

/**
 * Save user photo
 */
export async function saveUserPhoto(photo: InsertUserPhoto) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save photo: database not available");
    return null;
  }

  try {
    const result = await db.insert(userPhotos).values(photo);
    return result;
  } catch (error) {
    console.error("[Database] Failed to save photo:", error);
    return null;
  }
}

/**
 * Get user's photos
 */
export async function getUserPhotos(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get photos: database not available");
    return [];
  }

  try {
    return await db.select().from(userPhotos).where(eq(userPhotos.userId, userId));
  } catch (error) {
    console.error("[Database] Failed to get photos:", error);
    return [];
  }
}

/**
 * Save try-on history record
 */
export async function saveTryOnHistory(record: InsertTryOnHistory) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save try-on history: database not available");
    return null;
  }

  try {
    const result = await db.insert(tryOnHistory).values(record);
    return result;
  } catch (error) {
    console.error("[Database] Failed to save try-on history:", error);
    return null;
  }
}

/**
 * Get try-on history for user
 */
export async function getTryOnHistory(userId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get try-on history: database not available");
    return [];
  }

  try {
    return await db
      .select()
      .from(tryOnHistory)
      .where(eq(tryOnHistory.userId, userId))
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get try-on history:", error);
    return [];
  }
}

/** Persist a final try-on state so completed gallery entries retain their result. */
export async function updateTryOnHistory(
  historyId: number,
  update: Partial<Pick<InsertTryOnHistory, "resultImageUrl" | "resultImageKey" | "creditsDeducted" | "status" | "bubbleApiResponse">>,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(tryOnHistory).set({ ...update, completedAt: new Date() }).where(eq(tryOnHistory.id, historyId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update try-on history:", error);
    return false;
  }
}

export type TryOnTaskStage = {
  key: string;
  label: string;
  state: "active" | "completed" | "error";
  detail?: string;
  timestamp: number;
};

export type ComfyUiTaskMetadata = {
  kind: "qwen-image-edit-rapid";
  promptId: string;
  uploadedFilename: string;
  queuedAt: number;
  /** Policy cost captured at task submission; creditsDeducted remains zero until success. */
  creditCost?: number;
  positivePrompt?: string;
  loraWeights?: QwenLoraWeights;
};

type PersistedTryOnTaskState = {
  version: 1;
  taskStages: TryOnTaskStage[];
  comfyui?: ComfyUiTaskMetadata;
};

/**
 * Save non-final, user-safe diagnostic stages without setting completedAt.
 * The same existing history column is used to avoid a schema migration for
 * short-lived task state.
 */
export async function updateTryOnTaskStages(
  historyId: number,
  stages: TryOnTaskStage[],
  comfyui?: ComfyUiTaskMetadata,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(tryOnHistory)
      .set({ bubbleApiResponse: JSON.stringify({ version: 1, taskStages: stages, ...(comfyui ? { comfyui } : {}) }) })
      .where(eq(tryOnHistory.id, historyId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update try-on task stages:", error);
    return false;
  }
}

/** Persist the exact policy cost reserved for a pending task without finalizing it. */
export async function reservePendingTryOnCredits(historyId: number, credits: number): Promise<boolean> {
  const db = await getDb();
  if (!db || !Number.isSafeInteger(credits) || credits <= 0) return false;
  try {
    const result = await db.update(tryOnHistory)
      .set({ creditsDeducted: credits })
      .where(and(eq(tryOnHistory.id, historyId), eq(tryOnHistory.status, "pending")));
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: unknown }).affectedRows ?? 0) === 1;
  } catch (error) {
    console.error("[Database] Failed to reserve try-on credits:", error);
    return false;
  }
}

/**
 * Transition a pending task to failed exactly once. The boolean result lets
 * callers issue its credit refund only when this invocation won the state
 * transition, which keeps concurrent UI polling and scheduled refreshes safe.
 */
export async function failPendingTryOnTask(
  historyId: number,
  stages: TryOnTaskStage[],
  comfyui?: ComfyUiTaskMetadata,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const result = await db
      .update(tryOnHistory)
      .set({
        status: "failed",
        creditsDeducted: 0,
        completedAt: new Date(),
        bubbleApiResponse: JSON.stringify({ version: 1, taskStages: stages, ...(comfyui ? { comfyui } : {}) }),
      })
      .where(and(eq(tryOnHistory.id, historyId), eq(tryOnHistory.status, "pending")));
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: unknown }).affectedRows ?? 0) > 0;
  } catch (error) {
    console.error("[Database] Failed to finalize pending try-on task as failed:", error);
    return false;
  }
}

function parseTaskState(serialized: string | null): PersistedTryOnTaskState | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as { taskStages?: unknown; comfyui?: unknown };
    if (!Array.isArray(parsed.taskStages)) return null;
    const taskStages = parsed.taskStages.filter((stage): stage is TryOnTaskStage => (
      typeof stage === "object" && stage !== null &&
      typeof (stage as TryOnTaskStage).key === "string" &&
      typeof (stage as TryOnTaskStage).label === "string" &&
      ["active", "completed", "error"].includes((stage as TryOnTaskStage).state) &&
      typeof (stage as TryOnTaskStage).timestamp === "number"
    ));
    const comfyui = parsed.comfyui;
    const safeComfyUi = (
      typeof comfyui === "object" && comfyui !== null &&
      (comfyui as ComfyUiTaskMetadata).kind === "qwen-image-edit-rapid" &&
      typeof (comfyui as ComfyUiTaskMetadata).promptId === "string" &&
      typeof (comfyui as ComfyUiTaskMetadata).uploadedFilename === "string" &&
      typeof (comfyui as ComfyUiTaskMetadata).queuedAt === "number"
    ) ? comfyui as ComfyUiTaskMetadata : undefined;
    return { version: 1, taskStages, ...(safeComfyUi ? { comfyui: safeComfyUi } : {}) };
  } catch {
    return null;
  }
}

export function getComfyUiTaskMetadata(serialized: string | null): ComfyUiTaskMetadata | null {
  return parseTaskState(serialized)?.comfyui ?? null;
}

function parseTaskStages(serialized: string | null): TryOnTaskStage[] {
  return parseTaskState(serialized)?.taskStages ?? [];
}

/** Return only the signed-in user's latest unfinished try-on and safe task stages. */
export async function getActiveTryOnTask(userId: number) {
  const db = await getDb();
  if (!db) return null;

  try {
    const rows = await db
      .select({
        id: tryOnHistory.id,
        shirtStyle: tryOnHistory.shirtStyle,
        createdAt: tryOnHistory.createdAt,
        bubbleApiResponse: tryOnHistory.bubbleApiResponse,
      })
      .from(tryOnHistory)
      .where(and(eq(tryOnHistory.userId, userId), eq(tryOnHistory.status, "pending")))
      .orderBy(desc(tryOnHistory.id))
      .limit(1);

    const task = rows[0];
    if (!task) return null;
    return {
      id: task.id,
      shirtStyle: task.shirtStyle,
      createdAt: task.createdAt,
      stages: parseTaskStages(task.bubbleApiResponse),
    };
  } catch (error) {
    console.error("[Database] Failed to get active try-on task:", error);
    return null;
  }
}

/** Load a single try-on task only when it belongs to the authenticated user. */
export async function getUserTryOnTask(userId: number, historyId: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({
        id: tryOnHistory.id,
        photoId: tryOnHistory.photoId,
        shirtStyle: tryOnHistory.shirtStyle,
        status: tryOnHistory.status,
        creditsDeducted: tryOnHistory.creditsDeducted,
        resultImageUrl: tryOnHistory.resultImageUrl,
        resultImageKey: tryOnHistory.resultImageKey,
        bubbleApiResponse: tryOnHistory.bubbleApiResponse,
        createdAt: tryOnHistory.createdAt,
      })
      .from(tryOnHistory)
      .where(and(eq(tryOnHistory.userId, userId), eq(tryOnHistory.id, historyId)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to get user try-on task:", error);
    return null;
  }
}

/** Return a bounded batch of direct-ComfyUI XXX tasks for the protected scheduled finalizer. */
export async function getPendingDirectComfyUiTasks(limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({ id: tryOnHistory.id, userId: tryOnHistory.userId })
      .from(tryOnHistory)
      .where(and(
        eq(tryOnHistory.shirtStyle, QWEN_EDIT_STYLE_ID),
        eq(tryOnHistory.status, "pending"),
      ))
      .orderBy(desc(tryOnHistory.id))
      .limit(Math.min(Math.max(limit, 1), 10));
  } catch (error) {
    console.error("[Database] Failed to load pending direct ComfyUI tasks:", error);
    return [];
  }
}

/** Return only the signed-in user's image history, with photo ownership checked in the join. */
export async function getUserGallery(userId: number, limit: number = 60) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({
        id: tryOnHistory.id,
        photoId: tryOnHistory.photoId,
        shirtStyle: tryOnHistory.shirtStyle,
        status: tryOnHistory.status,
        sourceImageUrl: userPhotos.photoUrl,
        resultImageUrl: tryOnHistory.resultImageUrl,
        createdAt: tryOnHistory.createdAt,
        completedAt: tryOnHistory.completedAt,
        creditsDeducted: tryOnHistory.creditsDeducted,
      })
      .from(tryOnHistory)
      .leftJoin(userPhotos, and(eq(userPhotos.id, tryOnHistory.photoId), eq(userPhotos.userId, tryOnHistory.userId)))
      .where(eq(tryOnHistory.userId, userId))
      .orderBy(desc(tryOnHistory.id))
      .limit(Math.min(Math.max(limit, 1), 100));
  } catch (error) {
    console.error("[Database] Failed to get user gallery:", error);
    return [];
  }
}

/**
 * Delete a Gallery history entry only when it belongs to the signed-in user.
 * Removing this record also removes the application's reference to any
 * generated-result storage key. The managed storage adapter has no physical
 * object-delete API, so the underlying object cannot be removed here.
 */
export async function deleteUserGalleryEntry(userId: number, historyId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const ownedEntry = await db
      .select({ id: tryOnHistory.id })
      .from(tryOnHistory)
      .where(and(eq(tryOnHistory.id, historyId), eq(tryOnHistory.userId, userId)))
      .limit(1);

    if (!ownedEntry[0]) return false;

    await db
      .delete(tryOnHistory)
      .where(and(eq(tryOnHistory.id, historyId), eq(tryOnHistory.userId, userId)));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete user gallery entry:", error);
    return false;
  }
}

/** Return the minimal profile fields needed by the restricted admin workspace. */
export async function getAdminUsers(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        credits: users.credits,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .orderBy(desc(users.lastSignedIn))
      .limit(Math.min(Math.max(limit, 1), 250));
  } catch (error) {
    console.error("[Database] Failed to get admin user list:", error);
    return [];
  }
}

export async function getAdminUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    const profiles = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        credits: users.credits,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return profiles[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to get admin user profile:", error);
    return null;
  }
}

/** Return recent all-status task records with the authoritative route persisted at submission time. */
export async function getAdminUserTaskDiagnostics(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        historyId: tryOnHistory.id,
        shirtStyle: tryOnHistory.shirtStyle,
        status: tryOnHistory.status,
        createdAt: tryOnHistory.createdAt,
        completedAt: tryOnHistory.completedAt,
        taskId: comfyBridgeTasks.id,
        bridgeStatus: comfyBridgeTasks.status,
        bubbleApiResponse: tryOnHistory.bubbleApiResponse,
      })
      .from(tryOnHistory)
      .leftJoin(comfyBridgeTasks, eq(comfyBridgeTasks.historyId, tryOnHistory.id))
      .where(eq(tryOnHistory.userId, userId))
      .orderBy(desc(tryOnHistory.id))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map(({ bubbleApiResponse, ...task }) => {
      const routeDiagnostic = getStoredTaskRouteDiagnostic(bubbleApiResponse);
      return {
        ...task,
        processingRoute: routeDiagnostic?.processingRoute ?? null,
        routeDetail: routeDiagnostic?.detail ?? null,
      };
    });
  } catch (error) {
    console.error("[Database] Failed to get administrator task route diagnostics:", error);
    return [];
  }
}

function getStoredTaskFailureDetail(serialized: string | null): string | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as { taskStages?: unknown };
    if (!Array.isArray(parsed.taskStages)) return null;
    for (const stage of [...parsed.taskStages].reverse()) {
      if (
        typeof stage === "object" &&
        stage !== null &&
        (stage as { state?: unknown }).state === "error" &&
        typeof (stage as { detail?: unknown }).detail === "string" &&
        (stage as { detail: string }).detail.length > 0
      ) {
        return (stage as { detail: string }).detail;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Return complete failure diagnostics for every failed image-generation task owned by the selected user. */
export async function getAdminUserTaskErrors(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        historyId: tryOnHistory.id,
        shirtStyle: tryOnHistory.shirtStyle,
        status: tryOnHistory.status,
        createdAt: tryOnHistory.createdAt,
        completedAt: tryOnHistory.completedAt,
        taskId: comfyBridgeTasks.id,
        bridgeStatus: comfyBridgeTasks.status,
        attemptCount: comfyBridgeTasks.attemptCount,
        progressKey: comfyBridgeTasks.progressKey,
        progressLabel: comfyBridgeTasks.progressLabel,
        progressDetail: comfyBridgeTasks.progressDetail,
        lastError: comfyBridgeTasks.lastError,
        bubbleApiResponse: tryOnHistory.bubbleApiResponse,
      })
      .from(tryOnHistory)
      .leftJoin(comfyBridgeTasks, eq(comfyBridgeTasks.historyId, tryOnHistory.id))
      .where(and(
        eq(tryOnHistory.userId, userId),
        eq(tryOnHistory.status, "failed"),
      ))
      .orderBy(desc(tryOnHistory.id))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map(({ bubbleApiResponse, lastError, ...task }) => {
      const routeDiagnostic = getStoredTaskRouteDiagnostic(bubbleApiResponse);
      return {
        ...task,
        processingRoute: routeDiagnostic?.processingRoute ?? null,
        routeDetail: routeDiagnostic?.detail ?? null,
        fullError: lastError ?? getStoredTaskFailureDetail(bubbleApiResponse) ?? "No detailed error was recorded for this task.",
      };
    });
  } catch (error) {
    console.error("[Database] Failed to get administrator image-generation task errors:", error);
    return [];
  }
}
