import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowBroadcastStatus } from "@subscriber.dev/db/schema";
import {
  workflowBroadcasts,
  workflowRuns,
  workflowRunSteps,
} from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

export const createBroadcast = async (
  db: dbClient,
  data: {
    workflowId: number;
    environmentId: number;
    audienceQuery: Record<string, unknown>;
    sendOverMs?: number | null;
    createdBy: number;
  },
) => {
  const [result] = await db
    .insert(workflowBroadcasts)
    .values({
      publicId: generateUID(),
      workflowId: data.workflowId,
      environmentId: data.environmentId,
      audienceQuery: data.audienceQuery,
      sendOverMs: data.sendOverMs ?? null,
      createdBy: data.createdBy,
    })
    .returning();

  if (!result) throw new Error("Failed to create broadcast");
  return result;
};

export const getBroadcastById = async (db: dbClient, id: number) => {
  return await db.query.workflowBroadcasts.findFirst({
    where: eq(workflowBroadcasts.id, id),
  });
};

export const markBroadcastDispatched = async (
  db: dbClient,
  id: number,
  matchedCount: number,
) => {
  await db
    .update(workflowBroadcasts)
    .set({ matchedCount })
    .where(eq(workflowBroadcasts.id, id));
  await db
    .update(workflowBroadcasts)
    .set({ status: "queued" })
    .where(
      and(
        eq(workflowBroadcasts.id, id),
        eq(workflowBroadcasts.status, "pending"),
      ),
    );
};

export const transitionBroadcastStatus = async (
  db: dbClient,
  id: number,
  from: WorkflowBroadcastStatus[],
  to: WorkflowBroadcastStatus,
) => {
  const [result] = await db
    .update(workflowBroadcasts)
    .set({ status: to })
    .where(
      and(
        eq(workflowBroadcasts.id, id),
        inArray(workflowBroadcasts.status, from),
      ),
    )
    .returning();

  return result;
};

export const pauseBroadcast = async (db: dbClient, id: number) => {
  const [result] = await db
    .update(workflowBroadcasts)
    .set({ status: "paused", pausedAt: sql`now()` })
    .where(
      and(
        eq(workflowBroadcasts.id, id),
        inArray(workflowBroadcasts.status, ["pending", "queued"]),
      ),
    )
    .returning();

  return result;
};

export const resumeBroadcast = async (db: dbClient, id: number) => {
  return await db.transaction(async (tx) => {
    const [resumed] = await tx
      .update(workflowBroadcasts)
      .set({
        status: sql`CASE WHEN ${workflowBroadcasts.matchedCount} IS NULL THEN 'pending' ELSE 'queued' END::"workflowBroadcastStatus"`,
      })
      .where(
        and(
          eq(workflowBroadcasts.id, id),
          eq(workflowBroadcasts.status, "paused"),
        ),
      )
      .returning();
    if (!resumed) return undefined;

    if (resumed.pausedAt) {
      await tx
        .update(workflowRunSteps)
        .set({
          scheduledAt: sql`${workflowRunSteps.scheduledAt} + (now()::timestamp - GREATEST((SELECT ${workflowBroadcasts.pausedAt} FROM ${workflowBroadcasts} WHERE ${workflowBroadcasts.id} = ${id}), ${workflowRunSteps.createdAt}))`,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(workflowRunSteps.runId, broadcastRunIds(db, id)),
            eq(workflowRunSteps.status, "pending"),
          ),
        );
    }

    const [cleared] = await tx
      .update(workflowBroadcasts)
      .set({ pausedAt: null })
      .where(eq(workflowBroadcasts.id, id))
      .returning();
    return cleared;
  });
};

export const markBroadcastFailed = async (db: dbClient, id: number) => {
  await db
    .update(workflowBroadcasts)
    .set({ status: "failed" })
    .where(
      and(
        eq(workflowBroadcasts.id, id),
        inArray(workflowBroadcasts.status, ["pending", "queued", "paused"]),
      ),
    );
};

const broadcastRunIds = (db: dbClient, broadcastId: number) =>
  db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.broadcastId, broadcastId));

export const listPendingStepsForBroadcast = async (
  db: dbClient,
  broadcastId: number,
) => {
  return await db
    .select({
      id: workflowRunSteps.id,
      bullJobId: workflowRunSteps.bullJobId,
      scheduledAt: workflowRunSteps.scheduledAt,
    })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.broadcastId, broadcastId),
        eq(workflowRunSteps.status, "pending"),
      ),
    );
};

export const getRunForSubscriber = async (
  db: dbClient,
  broadcastId: number,
  subscriberId: number,
) => {
  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.broadcastId, broadcastId),
        eq(workflowRuns.subscriberId, subscriberId),
      ),
    )
    .limit(1);
  return row;
};

export const countRunsForBroadcast = async (
  db: dbClient,
  broadcastId: number,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(workflowRuns)
    .where(eq(workflowRuns.broadcastId, broadcastId));
  return row?.count ?? 0;
};

export const cancelPendingStepsForBroadcast = async (
  db: dbClient,
  broadcastId: number,
  reason: string,
) => {
  const runIds = broadcastRunIds(db, broadcastId);

  await db
    .update(workflowRunSteps)
    .set({ status: "cancelled", errorMessage: reason, updatedAt: new Date() })
    .where(
      and(
        inArray(workflowRunSteps.runId, runIds),
        eq(workflowRunSteps.status, "pending"),
      ),
    );

  await db
    .update(workflowRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.broadcastId, broadcastId),
        eq(workflowRuns.status, "active"),
      ),
    );
};

export const getBroadcastSendState = async (
  db: dbClient,
  runStepId: number,
): Promise<
  { state: "send" | "hold" | "cancel"; scheduledAt: Date } | undefined
> => {
  const [row] = await db
    .select({
      status: workflowBroadcasts.status,
      scheduledAt: workflowRunSteps.scheduledAt,
    })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .innerJoin(
      workflowBroadcasts,
      eq(workflowRuns.broadcastId, workflowBroadcasts.id),
    )
    .where(eq(workflowRunSteps.id, runStepId));

  if (!row) return undefined;
  const { scheduledAt } = row;
  if (row.status === "paused") return { state: "hold", scheduledAt };
  if (row.status === "cancelled" || row.status === "failed") {
    return { state: "cancel", scheduledAt };
  }
  return { state: "send", scheduledAt };
};

export const getBroadcastByPublicId = async (
  db: dbClient,
  workflowId: number,
  publicId: string,
) => {
  return await db.query.workflowBroadcasts.findFirst({
    where: and(
      eq(workflowBroadcasts.workflowId, workflowId),
      eq(workflowBroadcasts.publicId, publicId),
    ),
  });
};

export const listBroadcastsForWorkflow = async (
  db: dbClient,
  workflowId: number,
  opts: { limit: number; offset: number },
) => {
  return await db.query.workflowBroadcasts.findMany({
    where: eq(workflowBroadcasts.workflowId, workflowId),
    orderBy: desc(workflowBroadcasts.createdAt),
    limit: opts.limit,
    offset: opts.offset,
  });
};

export const getBroadcastStepCounts = async (
  db: dbClient,
  broadcastId: number,
) => {
  const rows = await db
    .select({ status: workflowRunSteps.status, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(eq(workflowRuns.broadcastId, broadcastId))
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

export const getBroadcastBounceBreakdown = async (
  db: dbClient,
  broadcastId: number,
) => {
  const rows = await db
    .select({ bounceType: workflowRunSteps.bounceType, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.broadcastId, broadcastId),
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
