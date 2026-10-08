import {
  bigint,
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces.js";

export const workspaceBilling = pgTable("workspaceBilling", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: bigint("workspaceId", { mode: "number" })
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripeCustomerId").notNull().unique(),
  stripeSubscriptionId: text("stripeSubscriptionId").unique(),
  plan: varchar("plan", { length: 32 }).notNull().default("free"),
  interval: varchar("interval", { length: 8 }).$type<"month" | "year">(),
  status: varchar("status", { length: 32 }),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  overLimitSince: timestamp("overLimitSince"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}).enableRLS();
