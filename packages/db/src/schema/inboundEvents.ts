import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { environments } from "./environments.js";
import { subscribers } from "./subscribers.js";

export const inboundEventStatuses = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const;
export type InboundEventStatus = (typeof inboundEventStatuses)[number];
export const inboundEventStatusEnum = pgEnum(
  "inboundEventStatus",
  inboundEventStatuses,
);

export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    environmentId: bigint("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 50 }).notNull(),
    externalEventId: varchar("externalEventId", { length: 255 }).notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: inboundEventStatusEnum("status").notNull().default("received"),
    matchedEvents: jsonb("matchedEvents").$type<string[]>(),
    outcome: text("outcome"),
    subscriberId: bigint("subscriberId", { mode: "number" }).references(
      () => subscribers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    processedAt: timestamp("processedAt"),
  },
  (table) => [
    unique("inbound_events_environment_source_event").on(
      table.environmentId,
      table.source,
      table.externalEventId,
    ),
    index("inbound_events_environment_createdAt_idx").on(
      table.environmentId,
      table.createdAt,
    ),
  ],
);

export const subscriberIdentities = pgTable(
  "subscriber_identities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    environmentId: bigint("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    subscriberId: bigint("subscriberId", { mode: "number" })
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 50 }).notNull(),
    externalId: varchar("externalId", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    unique("subscriber_identities_environment_source_external").on(
      table.environmentId,
      table.source,
      table.externalId,
    ),
    index("subscriber_identities_subscriberId_idx").on(table.subscriberId),
  ],
);
