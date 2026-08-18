import { and, count, desc, eq } from "drizzle-orm";

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

export const updateBroadcastProgress = async (
  db: dbClient,
  id: number,
  data: { matchedCount?: number; status: WorkflowBroadcastStatus },
) => {
  const [result] = await db
    .update(workflowBroadcasts)
    .set(data)
    .where(eq(workflowBroadcasts.id, id))
    .returning();

  return result;
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
