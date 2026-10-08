import { relations } from "drizzle-orm";
import {
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { apikey } from "./auth.js";
import { workspaceMembers } from "./workspaces.js";

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: text("publicId")
    .notNull()
    .unique()
    .$defaultFn(() => generateUID()),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: varchar("image", { length: 255 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apikey),
  workspaceMemberships: many(workspaceMembers),
}));
