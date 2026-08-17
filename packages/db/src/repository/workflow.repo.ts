import { and, asc, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { workflows, workflowSteps } from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

interface WorkflowStepInput {
  type: string;
  delayMs: number;
  config: Record<string, unknown>;
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
  opts: { limit: number; offset: number },
) => {
  return await db.query.workflows.findMany({
    where: and(
      eq(workflows.environmentId, environmentId),
      isNull(workflows.deletedAt),
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
    steps: WorkflowStepInput[];
    createdBy: number;
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

    return { workflow, steps: stepRows };
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
    updatedBy: number;
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
  deletedBy: number,
) => {
  const [result] = await db
    .update(workflows)
    .set({ deletedAt: new Date(), deletedBy, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .returning();

  return result;
};
