import { and, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { subscriberTags } from "@subscriber.dev/db/schema";

export const addTag = async (
  db: dbClient,
  data: {
    subscriberId: number;
    environmentId: number;
    tag: string;
    createdBy: number;
  },
) => {
  const [result] = await db
    .insert(subscriberTags)
    .values({
      subscriberId: data.subscriberId,
      environmentId: data.environmentId,
      tag: data.tag,
      createdBy: data.createdBy,
    })
    .onConflictDoNothing({
      target: [subscriberTags.subscriberId, subscriberTags.tag],
    })
    .returning();

  return result;
};

export const removeTag = async (
  db: dbClient,
  subscriberId: number,
  tag: string,
) => {
  const [result] = await db
    .delete(subscriberTags)
    .where(
      and(
        eq(subscriberTags.subscriberId, subscriberId),
        eq(subscriberTags.tag, tag),
      ),
    )
    .returning();

  return result;
};

export const listTagsForSubscriber = async (
  db: dbClient,
  subscriberId: number,
) => {
  return await db.query.subscriberTags.findMany({
    where: eq(subscriberTags.subscriberId, subscriberId),
  });
};

export const listDistinctTagsForEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  const rows = await db
    .selectDistinct({ tag: subscriberTags.tag })
    .from(subscriberTags)
    .where(eq(subscriberTags.environmentId, environmentId))
    .orderBy(subscriberTags.tag);

  return rows.map((row) => row.tag);
};
