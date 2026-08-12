import { and, desc, eq, inArray } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowRunStepStatus } from "@subscriber.dev/db/schema";
import { workflowRuns, workflowRunSteps } from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

interface RunStepInput {
  stepId: number;
  stepOrder: number;
  type: string;
  configSnapshot: Record<string, unknown>;
  scheduledAt: Date;
}

export const createRunWithSteps = async (
  db: dbClient,
  data: {
    workflowId: number;
    environmentId: number;
    subscriberId: number;
    payload: Record<string, unknown> | null;
    createdBy: number;
    steps: RunStepInput[];
  },
) => {
  return await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(workflowRuns)
      .values({
        publicId: generateUID(),
        workflowId: data.workflowId,
        environmentId: data.environmentId,
        subscriberId: data.subscriberId,
        payload: data.payload,
        createdBy: data.createdBy,
      })
      .returning();

    if (!run) throw new Error("Failed to create workflow run");

    const runStepRows = await tx
      .insert(workflowRunSteps)
      .values(
        data.steps.map((s) => ({
          publicId: generateUID(),
          runId: run.id,
          stepId: s.stepId,
          stepOrder: s.stepOrder,
          type: s.type,
          configSnapshot: s.configSnapshot,
          scheduledAt: s.scheduledAt,
        })),
      )
      .returning();

    return { run, runSteps: runStepRows };
  });
};

export const setRunStepBullJobId = async (
  db: dbClient,
  runStepId: number,
  jobId: string,
) => {
  await db
    .update(workflowRunSteps)
    .set({ bullJobId: jobId, updatedAt: new Date() })
    .where(eq(workflowRunSteps.id, runStepId));
};

export const getRunStepById = async (db: dbClient, id: number) => {
  return await db.query.workflowRunSteps.findFirst({
    where: eq(workflowRunSteps.id, id),
  });
};

export const getRunStepByBullJobId = async (
  db: dbClient,
  bullJobId: string,
) => {
  return await db.query.workflowRunSteps.findFirst({
    where: eq(workflowRunSteps.bullJobId, bullJobId),
  });
};

export const getRunById = async (db: dbClient, id: number) => {
  return await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, id),
  });
};

export const updateRunStepStatus = async (
  db: dbClient,
  id: number,
  status: Extract<WorkflowRunStepStatus, "sent" | "skipped" | "failed">,
  errorMessage?: string,
) => {
  await db
    .update(workflowRunSteps)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      sentAt: status === "sent" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(workflowRunSteps.id, id));
};

export const listPendingRunStepsForSubscriber = async (
  db: dbClient,
  subscriberId: number,
) => {
  return await db
    .select({
      id: workflowRunSteps.id,
      bullJobId: workflowRunSteps.bullJobId,
    })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.subscriberId, subscriberId),
        eq(workflowRuns.status, "active"),
        eq(workflowRunSteps.status, "pending"),
      ),
    );
};

export const cancelPendingForSubscriber = async (
  db: dbClient,
  subscriberId: number,
  runStepIds: number[],
  reason: string,
) => {
  if (runStepIds.length > 0) {
    await db
      .update(workflowRunSteps)
      .set({ status: "cancelled", errorMessage: reason, updatedAt: new Date() })
      .where(inArray(workflowRunSteps.id, runStepIds));
  }

  await db
    .update(workflowRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.subscriberId, subscriberId),
        eq(workflowRuns.status, "active"),
      ),
    );
};

export const completeRunIfAllStepsTerminal = async (
  db: dbClient,
  runId: number,
) => {
  const steps = await db.query.workflowRunSteps.findMany({
    where: eq(workflowRunSteps.runId, runId),
  });

  const allTerminal = steps.every((s) => s.status !== "pending");

  if (allTerminal) {
    await db
      .update(workflowRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
  }
};

export const listRunsForWorkflow = async (
  db: dbClient,
  workflowId: number,
  opts: { limit: number; offset: number },
) => {
  return await db.query.workflowRuns.findMany({
    where: eq(workflowRuns.workflowId, workflowId),
    orderBy: desc(workflowRuns.triggeredAt),
    limit: opts.limit,
    offset: opts.offset,
    with: { steps: true, subscriber: true },
  });
};
