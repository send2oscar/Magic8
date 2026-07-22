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