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

import { environments } from "./environments.js";
import { users } from "./users.js";

export const subscribers = pgTable(
  "subscribers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
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
    // How the subscriber was created: "api", "mcp", or an inbound source such
    // as "stripe". Null for subscribers created before this was recorded.
    createdVia: varchar("createdVia", { length: 50 }),
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
    unique("subscribers_environment_publicId").on(
      table.environmentId,
      table.publicId,
    ),
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
  tags: many(subscriberTags),
}));

export const subscriberPreferences = pgTable(
  "subscriber_preferences",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
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
    index("subscriber_preferences_publicId_idx").on(table.publicId),
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

export const subscriberTags = pgTable(
  "subscriber_tags",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subscriberId: bigserial("subscriberId", { mode: "number" })
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    unique("subscriber_tags_subscriberId_tag").on(
      table.subscriberId,
      table.tag,
    ),
    index("subscriber_tags_environmentId_tag_idx").on(
      table.environmentId,
      table.tag,
    ),
  ],
);

export const subscriberTagsRelations = relations(subscriberTags, ({ one }) => ({
  subscriber: one(subscribers, {
    fields: [subscriberTags.subscriberId],
    references: [subscribers.id],
  }),
  environment: one(environments, {
    fields: [subscriberTags.environmentId],
    references: [environments.id],
  }),
}));
