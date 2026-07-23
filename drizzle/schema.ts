import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, longtext } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  credits: int("credits").default(5).notNull(), // New users get 5 credits
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * User photos table - stores uploaded photos for try-on
 */
export const userPhotos = mysqlTable("user_photos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  photoUrl: text("photoUrl").notNull(), // S3 URL
  photoKey: text("photoKey").notNull(), // S3 file key
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

export type UserPhoto = typeof userPhotos.$inferSelect;
export type InsertUserPhoto = typeof userPhotos.$inferInsert;

/**
 * Try-on history table - tracks all try-on attempts and results
 */
export const tryOnHistory = mysqlTable("try_on_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  photoId: int("photoId").notNull(),
  shirtStyle: varchar("shirtStyle", { length: 100 }).notNull(),
  resultImageUrl: text("resultImageUrl"), // S3 URL of the result
  resultImageKey: text("resultImageKey"), // S3 file key of the result
  creditsDeducted: int("creditsDeducted").default(1).notNull(),
  status: mysqlEnum("status", ["pending", "success", "failed"]).default("pending").notNull(),
  bubbleApiResponse: longtext("bubbleApiResponse"), // Store full API response for debugging
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type TryOnHistory = typeof tryOnHistory.$inferSelect;
export type InsertTryOnHistory = typeof tryOnHistory.$inferInsert;

/**
 * A workstation paired by the project owner. Only a one-way hash of the
 * automatically generated device credential is persisted on the server.
 */
export const comfyBridgeDevices = mysqlTable("comfy_bridge_devices", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  credentialHash: varchar("credentialHash", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type ComfyBridgeDevice = typeof comfyBridgeDevices.$inferSelect;
export type InsertComfyBridgeDevice = typeof comfyBridgeDevices.$inferInsert;

/**
 * A short-lived, single-use pairing code. The plaintext code is shown only
 * to the project owner when generated and is never stored in the database.
 */
export const comfyBridgePairings = mysqlTable("comfy_bridge_pairings", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  codeHash: varchar("codeHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ComfyBridgePairing = typeof comfyBridgePairings.$inferSelect;
export type InsertComfyBridgePairing = typeof comfyBridgePairings.$inferInsert;

/**
 * Durable job state for a fixed Qwen edit processed by a paired local Bridge.
 * Lease fields prevent more than one workstation from completing a task.
 */
export const comfyBridgeTasks = mysqlTable("comfy_bridge_tasks", {
  id: int("id").autoincrement().primaryKey(),
  historyId: int("historyId").notNull().unique(),
  userId: int("userId").notNull(),
  photoId: int("photoId").notNull(),
  deviceId: int("deviceId").notNull(),
  workflowId: varchar("workflowId", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["queued", "leased", "processing", "completed", "failed"]).default("queued").notNull(),
  leaseHash: varchar("leaseHash", { length: 128 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  attemptCount: int("attemptCount").default(0).notNull(),
  progressKey: varchar("progressKey", { length: 100 }),
  progressLabel: varchar("progressLabel", { length: 255 }),
  progressDetail: text("progressDetail"),
  promptId: varchar("promptId", { length: 128 }),
  lastError: varchar("lastError", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ComfyBridgeTask = typeof comfyBridgeTasks.$inferSelect;
export type InsertComfyBridgeTask = typeof comfyBridgeTasks.$inferInsert;
