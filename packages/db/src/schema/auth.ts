import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const session = pgTable("session", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: bigserial("userId", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
}).enableRLS();

export const account = pgTable("account", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: bigserial("userId", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}).enableRLS();

export const verification = pgTable("verification", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
}).enableRLS();

export const apikey = pgTable("apiKey", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: bigserial("userId", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: timestamp("lastRefillAt"),
  enabled: boolean("enabled"),
  rateLimitEnabled: boolean("rateLimitEnabled"),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount"),
  remaining: integer("remaining"),
  lastRequest: timestamp("lastRequest"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
}).enableRLS();

export const apiKeyRelations = relations(apikey, ({ one }) => ({
  user: one(users, {
    fields: [apikey.userId],
    references: [users.id],
    relationName: "apiKeyUser",
  }),
}));

// better-auth device-authorization plugin: `subscriber login` in the CLI.
export const deviceCode = pgTable("deviceCode", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceCode: text("deviceCode").notNull(),
  userCode: text("userCode").notNull(),
  userId: bigint("userId", { mode: "number" }).references(() => users.id, {
    onDelete: "cascade",
  }),
  expiresAt: timestamp("expiresAt").notNull(),
  status: text("status").notNull(),
  lastPolledAt: timestamp("lastPolledAt"),
  pollingInterval: integer("pollingInterval"),
  clientId: text("clientId"),
  scope: text("scope"),
}).enableRLS();
