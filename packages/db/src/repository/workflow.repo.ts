import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type {
  WorkflowChannels,
  WorkflowTriggerAction,
} from "@subscriber.dev/db/schema";
import {
  workflows,
  workflowSteps,
  workflowTriggers,
} from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

interface WorkflowStepInput {
  type: string;
  delayMs: number;
  config: Record<string, unknown>;
}

export interface WorkflowTriggerInput {
  source: string;
  event: string;
}

export const getWorkflowById = async (db: dbClient, id: number) => {
  return await db.query.workflows.findFirst({
    where: and(eq(workflows.id, id), isNull(workflows.deletedAt)),
  });
};

export const getWorkflowByPublicId = async (
  db: dbClient,
  environmentId: number,
  publicId: string,
) => {
  return await db.query.workflows.findFirst({
    where: and(
      eq(workflows.environmentId, environmentId),
      eq(workflows.publicId, publicId),
      isNull(workflows.deletedAt),
    ),
  });
};

export const getWorkflowByKey = async (
  db: dbClient,
  environmentId: number,
  key: string,
) => {
  return await db.query.workflows.findFirst({
    where: and(
      eq(workflows.environmentId, environmentId),
      eq(workflows.key, key),
      isNull(workflows.deletedAt),
    ),
  });
};

export const listWorkflows = async (
  db: dbClient,
  environmentId: number,
  opts: { limit: number; offset: number; type?: "automation" | "broadcast" },
) => {
  return await db.query.workflows.findMany({
    where: and(
      eq(workflows.environmentId, environmentId),
      isNull(workflows.deletedAt),
      opts.type ? eq(workflows.type, opts.type) : undefined,
    ),
    orderBy: asc(workflows.createdAt),
    limit: opts.limit,
    offset: opts.offset,
  });
};

export const listStepsForWorkflow = async (
  db: dbClient,
  workflowId: number,
) => {
  return await db.query.workflowSteps.findMany({
    where: eq(workflowSteps.workflowId, workflowId),
    orderBy: asc(workflowSteps.stepOrder),
  });
};

export const createWorkflow = async (
  db: dbClient,
  data: {
    environmentId: number;
    key: string;
    name: string;
    description?: string | null;
    type?: "automation" | "broadcast";
    channels?: WorkflowChannels | null;
    steps: WorkflowStepInput[];
    triggers?: WorkflowTriggerInput[];
    exitConditions?: WorkflowTriggerInput[];
    createdBy: number | null;
  },
) => {
  return await db.transaction(async (tx) => {
    const [workflow] = await tx
      .insert(workflows)
      .values({
        publicId: generateUID(),
        environmentId: data.environmentId,
        key: data.key,
        name: data.name,
        description: data.description ?? null,
        type: data.type ?? "automation",
        channels: data.channels ?? null,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      })
      .returning();

    if (!workflow) throw new Error("Failed to create workflow");

    const stepRows = await tx
      .insert(workflowSteps)
      .values(
        data.steps.map((s, i) => ({
          publicId: generateUID(),
          workflowId: workflow.id,
          stepOrder: i,
          type: s.type,
          delayMs: s.delayMs,
          config: s.config,
        })),
      )
      .returning();

    const triggerValues = [
      ...(data.triggers ?? []).map((t) => ({ ...t, action: "start" as const })),
      ...(data.exitConditions ?? []).map((t) => ({
        ...t,
        action: "exit" as const,
      })),
    ];
    const triggerRows = triggerValues.length
      ? await tx
          .insert(workflowTriggers)
          .values(
            triggerValues.map((t) => ({
              workflowId: workflow.id,
              environmentId: data.environmentId,
              action: t.action,
              source: t.source,
              event: t.event,
            })),
          )
          .returning()
      : [];

    return { workflow, steps: stepRows, triggers: triggerRows };
  });
};

export const replaceWorkflowSteps = async (
  db: dbClient,
  workflowId: number,
  steps: WorkflowStepInput[],
) => {
  return await db.transaction(async (tx) => {
    await tx
      .delete(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId));

    return await tx
      .insert(workflowSteps)
      .values(
        steps.map((s, i) => ({
          publicId: generateUID(),
          workflowId,
          stepOrder: i,
          type: s.type,
          delayMs: s.delayMs,
          config: s.config,
        })),
      )
      .returning();
  });
};

export const updateWorkflow = async (
  db: dbClient,
  id: number,
  data: {
    key?: string;
    name?: string;
    description?: string | null;
    status?: "active" | "paused";
    channels?: WorkflowChannels | null;
    updatedBy: number | null;
  },
) => {
  const [result] = await db
    .update(workflows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .returning();

  return result;
};

export const softDeleteWorkflow = async (
  db: dbClient,
  id: number,
  deletedBy: number | null,
) => {
  const [result] = await db
    .update(workflows)
    .set({ deletedAt: new Date(), deletedBy, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .returning();

  return result;
};

export const listTriggersForWorkflow = async (
  db: dbClient,
  workflowId: number,
) => {
  return await db
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.workflowId, workflowId))
    .orderBy(asc(workflowTriggers.id));
};

export const replaceWorkflowTriggers = async (
  db: dbClient,
  workflow: { id: number; environmentId: number },
  action: WorkflowTriggerAction,
  triggers: WorkflowTriggerInput[],
) => {
  return await db.transaction(async (tx) => {
    await tx
      .delete(workflowTriggers)
      .where(
        and(
          eq(workflowTriggers.workflowId, workflow.id),
          eq(workflowTriggers.action, action),
        ),
      );
    if (triggers.length === 0) return [];

    return await tx
      .insert(workflowTriggers)
      .values(
        triggers.map((t) => ({
          workflowId: workflow.id,
          environmentId: workflow.environmentId,
          action,
          source: t.source,
          event: t.event,
        })),
      )
      .returning();
  });
};

export const listWorkflowsTriggeredBy = async (
  db: dbClient,
  environmentId: number,
  source: string,
  events: string[],
  action: WorkflowTriggerAction = "start",
) => {
  if (events.length === 0) return [];
  return await db
    .selectDistinct({ id: workflows.id, key: workflows.key })
    .from(workflowTriggers)
    .innerJoin(workflows, eq(workflows.id, workflowTriggers.workflowId))
    .where(
      and(
        eq(workflowTriggers.environmentId, environmentId),
        eq(workflowTriggers.action, action),
        eq(workflowTriggers.source, source),
        inArray(workflowTriggers.event, events),
        isNull(workflows.deletedAt),
      ),
    )
    .orderBy(asc(workflows.id));
};

export const countTriggersForSource = async (
  db: dbClient,
  environmentId: number,
  source: string,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(workflowTriggers)
    .innerJoin(workflows, eq(workflows.id, workflowTriggers.workflowId))
    .where(
      and(
        eq(workflowTriggers.environmentId, environmentId),
        eq(workflowTriggers.source, source),
        isNull(workflows.deletedAt),
      ),
    );
  return row?.count ?? 0;
};
