import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { generateUID } from "@subscriber.dev/shared/utils";

import { environments } from "./environments.js";
import { subscribers } from "./subscribers.js";
import { users } from "./users.js";

export const workflowStatuses = ["active", "paused"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];
export const workflowStatusEnum = pgEnum("workflowStatus", workflowStatuses);

export const workflowTypes = ["automation", "broadcast"] as const;
export type WorkflowType = (typeof workflowTypes)[number];
export const workflowTypeEnum = pgEnum("workflowType", workflowTypes);

export const workflowRunStatuses = [
  "active",
  "completed",
  "cancelled",
] as const;
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];
export const workflowRunStatusEnum = pgEnum(
  "workflowRunStatus",
  workflowRunStatuses,
);

export const workflowRunStepStatuses = [
  "pending",
  "sent",
  "skipped",
  "failed",
  "cancelled",
  "bounced",
] as const;
export type WorkflowRunStepStatus = (typeof workflowRunStepStatuses)[number];
export const workflowRunStepStatusEnum = pgEnum(
  "workflowRunStepStatus",
  workflowRunStepStatuses,
);

export const bounceTypes = ["hard", "soft"] as const;
export type BounceType = (typeof bounceTypes)[number];
export const bounceTypeEnum = pgEnum("bounceType", bounceTypes);

export const workflowBroadcastStatuses = [
  "pending",
  "queued",
  "failed",
  "paused",
  "cancelled",
] as const;
export type WorkflowBroadcastStatus =
  (typeof workflowBroadcastStatuses)[number];
export const workflowBroadcastStatusEnum = pgEnum(
  "workflowBroadcastStatus",
  workflowBroadcastStatuses,
);

export const workflows = pgTable(
  "workflows",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .$defaultFn(() => generateUID()),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: workflowStatusEnum("status").notNull().default("active"),
    type: workflowTypeEnum("type").notNull().default("automation"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
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
    unique("workflows_environment_publicId").on(
      table.environmentId,
      table.publicId,
    ),
    unique("workflows_environment_key").on(table.environmentId, table.key),
    index("workflows_environmentId_idx").on(table.environmentId),
    index("workflows_key_idx").on(table.key),
    index("workflows_publicId_idx").on(table.publicId),
  ],
);

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  environment: one(environments, {
    fields: [workflows.environmentId],
    references: [environments.id],
  }),
  steps: many(workflowSteps),
  runs: many(workflowRuns),
  triggers: many(workflowTriggers),
}));

export const workflowSteps = pgTable(
  "workflow_steps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    workflowId: bigserial("workflowId", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    stepOrder: integer("stepOrder").notNull(),
    type: varchar("type", { length: 50 }).notNull().default("email"),
    delayMs: bigint("delayMs", { mode: "number" }).notNull().default(0),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    unique("workflow_steps_workflowId_stepOrder").on(
      table.workflowId,
      table.stepOrder,
    ),
    index("workflow_steps_workflowId_idx").on(table.workflowId),
  ],
);

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowSteps.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowTriggers = pgTable(
  "workflow_triggers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workflowId: bigint("workflowId", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    environmentId: bigint("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 50 }).notNull(),
    event: varchar("event", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    unique("workflow_triggers_workflow_source_event").on(
      table.workflowId,
      table.source,
      table.event,
    ),
    index("workflow_triggers_environment_source_event_idx").on(
      table.environmentId,
      table.source,
      table.event,
    ),
  ],
);

export const workflowTriggersRelations = relations(
  workflowTriggers,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowTriggers.workflowId],
      references: [workflows.id],
    }),
  }),
);

export const workflowBroadcasts = pgTable(
  "workflow_broadcasts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    workflowId: bigserial("workflowId", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    audienceQuery: jsonb("audienceQuery")
      .notNull()
      .$type<Record<string, unknown>>(),
    status: workflowBroadcastStatusEnum("status").notNull().default("pending"),
    matchedCount: integer("matchedCount"),
    sendOverMs: integer("sendOverMs"),
    pausedAt: timestamp("pausedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("workflow_broadcasts_workflowId_idx").on(table.workflowId),
    index("workflow_broadcasts_environmentId_idx").on(table.environmentId),
    index("workflow_broadcasts_publicId_idx").on(table.publicId),
  ],
);

export const workflowBroadcastsRelations = relations(
  workflowBroadcasts,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowBroadcasts.workflowId],
      references: [workflows.id],
    }),
    environment: one(environments, {
      fields: [workflowBroadcasts.environmentId],
      references: [environments.id],
    }),
    runs: many(workflowRuns),
  }),
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    workflowId: bigserial("workflowId", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    environmentId: bigserial("environmentId", { mode: "number" })
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    subscriberId: bigserial("subscriberId", { mode: "number" })
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    broadcastId: bigint("broadcastId", { mode: "number" }).references(
      () => workflowBroadcasts.id,
      { onDelete: "set null" },
    ),
    status: workflowRunStatusEnum("status").notNull().default("active"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }),
    triggeredAt: timestamp("triggeredAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    createdBy: bigint("createdBy", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("workflow_runs_workflowId_idx").on(table.workflowId),
    index("workflow_runs_environmentId_idx").on(table.environmentId),
    index("workflow_runs_subscriberId_idx").on(table.subscriberId),
    index("workflow_runs_status_idx").on(table.status),
    index("workflow_runs_broadcastId_idx").on(table.broadcastId),
    unique("workflow_runs_broadcast_subscriber").on(
      table.broadcastId,
      table.subscriberId,
    ),
    unique("workflow_runs_environment_idempotencyKey").on(
      table.environmentId,
      table.idempotencyKey,
    ),
  ],
);

export const workflowRunsRelations = relations(
  workflowRuns,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowRuns.workflowId],
      references: [workflows.id],
    }),
    subscriber: one(subscribers, {
      fields: [workflowRuns.subscriberId],
      references: [subscribers.id],
    }),
    broadcast: one(workflowBroadcasts, {
      fields: [workflowRuns.broadcastId],
      references: [workflowBroadcasts.id],
    }),
    steps: many(workflowRunSteps),
  }),
);

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: text("publicId")
      .notNull()
      .unique()
      .$defaultFn(() => generateUID()),
    runId: bigserial("runId", { mode: "number" })
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: bigint("stepId", { mode: "number" }).references(
      () => workflowSteps.id,
      { onDelete: "set null" },
    ),
    stepOrder: integer("stepOrder").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    configSnapshot: jsonb("configSnapshot")
      .notNull()
      .$type<Record<string, unknown>>(),
    scheduledAt: timestamp("scheduledAt").notNull(),
    sentAt: timestamp("sentAt"),
    status: workflowRunStepStatusEnum("status").notNull().default("pending"),
    bullJobId: varchar("bullJobId", { length: 255 }),
    errorMessage: text("errorMessage"),
    bounceType: bounceTypeEnum("bounceType"),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    unique("workflow_run_steps_runId_stepOrder").on(
      table.runId,
      table.stepOrder,
    ),
    index("workflow_run_steps_runId_idx").on(table.runId),
    index("workflow_run_steps_stepId_idx").on(table.stepId),
    index("workflow_run_steps_bullJobId_idx").on(table.bullJobId),
    index("workflow_run_steps_status_idx").on(table.status),
    index("workflow_run_steps_providerMessageId_idx").on(
      table.providerMessageId,
    ),
  ],
);

export const workflowRunStepsRelations = relations(
  workflowRunSteps,
  ({ one }) => ({
    run: one(workflowRuns, {
      fields: [workflowRunSteps.runId],
      references: [workflowRuns.id],
    }),
    step: one(workflowSteps, {
      fields: [workflowRunSteps.stepId],
      references: [workflowSteps.id],
    }),
  }),
);
