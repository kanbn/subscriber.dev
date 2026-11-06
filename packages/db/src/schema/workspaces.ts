import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { environments } from "./environments.js";
import { users } from "./users.js";

export const memberRoles = ["admin", "member", "guest"] as const;
export type MemberRole = (typeof memberRoles)[number];
export const memberRoleEnum = pgEnum("memberRole", memberRoles);

export const workspaces = pgTable("workspaces", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: text("publicId")
    .notNull()
    .unique()
    .$defaultFn(() => generateUID()),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  postalAddress: text("postalAddress"),
  poweredBy: boolean("poweredBy").notNull().default(true),
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
});

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  environments: many(environments),
}));

export const workspaceMembers = pgTable(
  "workspaceMembers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: bigserial("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: bigserial("userId", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
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
    unique("workspaceMembers_unique").on(table.workspaceId, table.userId),
    index("workspaceMembers_workspaceId_idx").on(table.workspaceId),
    index("workspaceMembers_userId_idx").on(table.userId),
  ],
);

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  }),
);
