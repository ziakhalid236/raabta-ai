import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Agent Tasks table to track autonomous operations.
 */
export const agentTasks = mysqlTable("agent_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  taskType: varchar("taskType", { length: 64 }).notNull(), // e.g., 'file_edit', 'db_migration', 'search'
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  payload: text("payload"), // JSON string of task input
  result: text("result"), // JSON string of task output/error
  priority: int("priority").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentTask = typeof agentTasks.$inferSelect;
export type InsertAgentTask = typeof agentTasks.$inferInsert;

/**
 * Agent Memory table for long-term context and learnings.
 */
export const agentMemory = mysqlTable("agent_memory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  contextKey: varchar("contextKey", { length: 128 }).notNull(), // e.g., 'user_preference', 'project_structure'
  content: text("content").notNull(),
  importance: int("importance").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentMemory = typeof agentMemory.$inferSelect;
export type InsertAgentMemory = typeof agentMemory.$inferInsert;
