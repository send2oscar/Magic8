import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, longtext } from "drizzle-orm/mysql-core";

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
 * One administrator-managed credit policy. Monetary values are stored as
 * integer cents to avoid floating-point rounding in checkout calculations.
 */
export const creditPolicies = mysqlTable("credit_policies", {
  id: int("id").autoincrement().primaryKey(),
  standardTryOnCredits: int("standardTryOnCredits").default(1).notNull(),
  xxxTryOnCredits: int("xxxTryOnCredits").default(10).notNull(),
  priceCentsPerTenCredits: int("priceCentsPerTenCredits").default(100).notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CreditPolicy = typeof creditPolicies.$inferSelect;
export type InsertCreditPolicy = typeof creditPolicies.$inferInsert;

/** Editable fixed quantities; their USD price is always calculated from the active policy. */
export const creditPackages = mysqlTable("credit_packages", {
  id: int("id").autoincrement().primaryKey(),
  credits: int("credits").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = typeof creditPackages.$inferInsert;

/**
 * Local payment ledger for PayPal resource identifiers and credit fulfillment.
 * No card, payer, raw webhook, or credential data is persisted here.
 */
export const paypalPayments = mysqlTable("paypal_payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  packageId: int("packageId"),
  orderId: varchar("orderId", { length: 127 }).notNull().unique(),
  captureId: varchar("captureId", { length: 127 }).unique(),
  creditAmount: int("creditAmount").notNull(),
  expectedAmountCents: int("expectedAmountCents").notNull(),
  status: mysqlEnum("status", ["created", "pending", "completed", "failed", "cancelled"]).default("created").notNull(),
  failureDetail: longtext("failureDetail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  capturedAt: timestamp("capturedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userCreatedIndex: index("paypal_payments_user_created_idx").on(table.userId, table.createdAt),
  statusCreatedIndex: index("paypal_payments_status_created_idx").on(table.status, table.createdAt),
}));

export type PayPalPayment = typeof paypalPayments.$inferSelect;
export type InsertPayPalPayment = typeof paypalPayments.$inferInsert;

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
  progressDetail: longtext("progressDetail"),
  /** Exact optional Dashboard prompt supplied for this XXX edit. */
  positivePrompt: longtext("positivePrompt"),
  promptId: varchar("promptId", { length: 128 }),
  /** Bridge-reported remaining seconds, when the local workstation can estimate it. */
  estimatedSecondsRemaining: int("estimatedSecondsRemaining"),
  /** Full failure text from the paired workstation; administrators can inspect it. */
  lastError: longtext("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ComfyBridgeTask = typeof comfyBridgeTasks.$inferSelect;
export type InsertComfyBridgeTask = typeof comfyBridgeTasks.$inferInsert;
