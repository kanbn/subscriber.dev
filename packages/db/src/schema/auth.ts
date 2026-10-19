import {
  bigint,
  bigserial,
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
