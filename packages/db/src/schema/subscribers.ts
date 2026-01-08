import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { environments } from "./environments";
import { users } from "./users";

export const subscribers = pgTable(
  "subscribers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 255 }),
    externalId: varchar("externalId", { length: 255 }),
    firstName: varchar("firstName", { length: 255 }),
    lastName: varchar("lastName", { length: 255 }),
    name: varchar("name", { length: 255 }),
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
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
    unique("subscribers_environment_externalId").on(
      table.environmentId,
      table.externalId,
    ),
    unique("subscribers_environment_email").on(
      table.environmentId,
      table.email,
    ),
    index("subscribers_environmentId_idx").on(table.environmentId),
    index("subscribers_email_idx").on(table.email),
    index("subscribers_externalId_idx").on(table.externalId),
    index("subscribers_publicId_idx").on(table.publicId),
  ],
);

export const subscribersRelations = relations(subscribers, ({ one, many }) => ({
  environment: one(environments, {
    fields: [subscribers.environmentId],
    references: [environments.id],
  }),
  preferences: many(subscriberPreferences),
}));

export const subscriberPreferences = pgTable(
  "subscriber_preferences",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subscriberId: bigserial("subscriberId", { mode: "number" })
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    email: boolean("email").notNull().default(true),
    version: bigint("version", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    index("subscriber_preferences_subscriberId_version_idx").on(
      table.subscriberId,
      table.version,
    ),
    index("subscriber_preferences_subscriberId_idx").on(table.subscriberId),
  ],
);

export const subscriberPreferencesRelations = relations(
  subscriberPreferences,
  ({ one }) => ({
    subscriber: one(subscribers, {
      fields: [subscriberPreferences.subscriberId],
      references: [subscribers.id],
    }),
  }),
);
