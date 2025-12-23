import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { users } from "./users";
import { memberRoleEnum, workspaces } from "./workspaces";

export const invitationStatuses = [
  "pending",
  "accepted",
  "declined",
  "expired",
] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];
export const invitationStatusEnum = pgEnum(
  "invitationStatus",
  invitationStatuses,
);

export const invitations = pgTable(
  "invitations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    workspaceId: bigserial("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: memberRoleEnum("role").notNull(),
    token: text("token").notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
    invitedBy: bigint("invitedBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    updatedBy: bigint("updatedBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    deletedBy: bigint("deletedBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("invitations_workspaceId_idx").on(table.workspaceId),
    index("invitations_email_idx").on(table.email),
    index("invitations_token_idx").on(table.token),
  ],
);

export const invitationsRelations = relations(invitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));
