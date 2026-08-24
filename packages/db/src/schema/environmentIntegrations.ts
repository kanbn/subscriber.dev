import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { environments } from "./environments.js";
import { users } from "./users.js";

export const environmentIntegrations = pgTable(
  "environment_integrations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    encryptedSecret: text("encryptedSecret"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    updatedBy: bigint("updatedBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    lastBounceCheckAt: timestamp("lastBounceCheckAt"),
    priority: integer("priority").notNull(),
  },
  (table) => [
    unique("environment_integrations_env_type").on(
      table.environmentId,
      table.type,
    ),
    index("environment_integrations_environmentId_idx").on(table.environmentId),
  ],
);

export const environmentIntegrationsRelations = relations(
  environmentIntegrations,
  ({ one }) => ({
    environment: one(environments, {
      fields: [environmentIntegrations.environmentId],
      references: [environments.id],
    }),
  }),
);
