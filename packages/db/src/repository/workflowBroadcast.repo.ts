import { eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowBroadcastStatus } from "@subscriber.dev/db/schema";
import { workflowBroadcasts } from "@subscriber.dev/db/schema";
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
