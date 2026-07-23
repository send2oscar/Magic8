import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userPhotos, InsertUserPhoto, tryOnHistory, InsertTryOnHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

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
    const currentCredits = await getUserCredits(userId);
    if (currentCredits < amount) {
      return false; // Not enough credits
    }

    await db
      .update(users)
      .set({ credits: currentCredits - amount })
      .where(eq(users.id, userId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to deduct credits:", error);
    return false;
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
    const currentCredits = await getUserCredits(userId);
    await db
      .update(users)
      .set({ credits: currentCredits + amount })
      .where(eq(users.id, userId));
    return true;
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
