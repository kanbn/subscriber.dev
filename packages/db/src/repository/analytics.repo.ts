import { and, count, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { workflowRuns, workflowRunSteps } from "@subscriber.dev/db/schema";

export const getEnvironmentStepCounts = async (
  db: dbClient,
  environmentId: number,
) => {
  const rows = await db
    .select({ status: workflowRunSteps.status, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(eq(workflowRuns.environmentId, environmentId))
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

export const getEnvironmentBounceBreakdown = async (
  db: dbClient,
  environmentId: number,
) => {
  const rows = await db
    .select({ bounceType: workflowRunSteps.bounceType, count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.environmentId, environmentId),
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
