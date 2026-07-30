import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { subscribers } from "./subscribers.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

export const environments = pgTable(
  "environments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    workspaceId: bigserial("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    updatedBy: bigint("updatedBy", { mode: "number" }).references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    deletedBy: bigint("deletedBy", { mode: "number" }).references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
  },
  (table) => [
    unique("environments_workspace_slug").on(table.workspaceId, table.slug),
    index("environments_workspaceId_idx").on(table.workspaceId),
  ],
);

export const environmentsRelations = relations(
  environments,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [environments.workspaceId],
      references: [workspaces.id],
    }),
    subscribers: many(subscribers),
  }),
);
