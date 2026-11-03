import { and, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";

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
    createdBy: number | null;
    broadcastId?: number | null;
    idempotencyKey?: string | null;
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
        broadcastId: data.broadcastId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
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

export const getRunStepByPublicId = async (db: dbClient, publicId: string) => {
  return await db.query.workflowRunSteps.findFirst({
    where: eq(workflowRunSteps.publicId, publicId),
  });
};

export const getRunStepByProviderMessageId = async (
  db: dbClient,
  environmentId: number,
  providerMessageId: string,
) => {
  return await db.query.workflowRunSteps.findFirst({
    where: and(
      eq(workflowRunSteps.providerMessageId, providerMessageId),
      inArray(
        workflowRunSteps.runId,
        db
          .select({ id: workflowRuns.id })
          .from(workflowRuns)
          .where(eq(workflowRuns.environmentId, environmentId)),
      ),
    ),
  });
};

export const getRunById = async (db: dbClient, id: number) => {
  return await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, id),
    with: { workflow: { columns: { channels: true } } },
  });
};

export const listUnqueuedPendingSteps = async (db: dbClient, runId: number) => {
  return await db
    .select({
      id: workflowRunSteps.id,
      scheduledAt: workflowRunSteps.scheduledAt,
    })
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.runId, runId),
        eq(workflowRunSteps.status, "pending"),
        isNull(workflowRunSteps.bullJobId),
      ),
    );
};

export const updateRunStepStatus = async (
  db: dbClient,
  id: number,
  status: Extract<
    WorkflowRunStepStatus,
    "sent" | "skipped" | "failed" | "cancelled"
  >,
  errorMessage?: string,
  providerMessageId?: string,
) => {
  await db
    .update(workflowRunSteps)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      sentAt: status === "sent" ? new Date() : undefined,
      providerMessageId,
      updatedAt: new Date(),
    })
    .where(eq(workflowRunSteps.id, id));
};

export const markRunStepBounced = async (
  db: dbClient,
  id: number,
  data: { bounceType: "hard" | "soft"; reason: string },
) => {
  await db
    .update(workflowRunSteps)
    .set({
      status: "bounced",
      bounceType: data.bounceType,
      errorMessage: data.reason,
      updatedAt: new Date(),
    })
    .where(eq(workflowRunSteps.id, id));
};

export interface RunScope {
  workflowId: number;
  keepIdempotencyKey?: string;
}

const scopeFilters = (scope: RunScope | undefined) =>
  scope
    ? [
        eq(workflowRuns.workflowId, scope.workflowId),
        scope.keepIdempotencyKey === undefined
          ? undefined
          : or(
              isNull(workflowRuns.idempotencyKey),
              ne(workflowRuns.idempotencyKey, scope.keepIdempotencyKey),
            ),
      ]
    : [];

export const listPendingRunStepsForSubscriber = async (
  db: dbClient,
  subscriberId: number,
  scope?: RunScope,
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
        ...scopeFilters(scope),
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
  scope?: RunScope,
) => {
  if (runStepIds.length > 0) {
    await db
      .update(workflowRunSteps)
      .set({ status: "cancelled", errorMessage: reason, updatedAt: new Date() })
      .where(inArray(workflowRunSteps.id, runStepIds));
  }

  const cancelled = await db
    .update(workflowRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.subscriberId, subscriberId),
        ...scopeFilters(scope),
        eq(workflowRuns.status, "active"),
      ),
    )
    .returning({ id: workflowRuns.id });
  return cancelled.length;
};

export const getRunByIdempotencyKey = async (
  db: dbClient,
  environmentId: number,
  idempotencyKey: string,
) => {
  const [row] = await db
    .select({ id: workflowRuns.id, publicId: workflowRuns.publicId })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.environmentId, environmentId),
        eq(workflowRuns.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row;
};

export const completeRunIfAllStepsTerminal = async (
  db: dbClient,
  runId: number,
  finalStatus: "completed" | "cancelled" = "completed",
) => {
  const steps = await db.query.workflowRunSteps.findMany({
    where: eq(workflowRunSteps.runId, runId),
  });

  const allTerminal = steps.every((s) => s.status !== "pending");

  if (allTerminal) {
    await db
      .update(workflowRuns)
      .set({ status: finalStatus, completedAt: new Date() })
      .where(
        and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "active")),
      );
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

export const getWorkflowStepCounts = async (
  db: dbClient,
  workflowId: number,
) => {
  const rows = await db
    .select({ status: workflowRunSteps.status, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(eq(workflowRuns.workflowId, workflowId))
    .groupBy(workflowRunSteps.status);

  const counts = {
    pending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    cancelled: 0,
    bounced: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
};

export const getWorkflowBounceBreakdown = async (
  db: dbClient,
  workflowId: number,
) => {
  const rows = await db
    .select({ bounceType: workflowRunSteps.bounceType, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRunSteps.status, "bounced"),
      ),
    )
    .groupBy(workflowRunSteps.bounceType);

  const counts = { hard: 0, soft: 0 };
  for (const row of rows) {
    if (row.bounceType) counts[row.bounceType] = row.count;
  }
  return counts;
};

export const listRunsForEnvironment = async (
  db: dbClient,
  environmentId: number,
  opts: { limit: number; offset: number },
) => {
  return await db.query.workflowRuns.findMany({
    where: eq(workflowRuns.environmentId, environmentId),
    orderBy: desc(workflowRuns.triggeredAt),
    limit: opts.limit,
    offset: opts.offset,
    with: { steps: true, subscriber: true, workflow: true },
  });
};
