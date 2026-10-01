import { and, desc, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type { InboundEventStatus } from "@subscriber.dev/db/schema";
import {
  inboundEvents,
  subscriberIdentities,
  subscribers,
} from "@subscriber.dev/db/schema";

export const recordInboundEvent = async (
  db: dbClient,
  data: {
    environmentId: number;
    source: string;
    externalEventId: string;
    type: string;
    payload: Record<string, unknown>;
  },
) => {
  const [inserted] = await db
    .insert(inboundEvents)
    .values(data)
    .onConflictDoNothing()
    .returning({ id: inboundEvents.id, status: inboundEvents.status });
  if (inserted) return inserted;

  const [existing] = await db
    .select({ id: inboundEvents.id, status: inboundEvents.status })
    .from(inboundEvents)
    .where(
      and(
        eq(inboundEvents.environmentId, data.environmentId),
        eq(inboundEvents.source, data.source),
        eq(inboundEvents.externalEventId, data.externalEventId),
      ),
    );
  if (!existing) throw new Error("Inbound event vanished after conflict");
  return existing;
};

export const getInboundEventById = async (db: dbClient, id: number) => {
  return await db.query.inboundEvents.findFirst({
    where: eq(inboundEvents.id, id),
  });
};

export const completeInboundEvent = async (
  db: dbClient,
  id: number,
  data: {
    status: Exclude<InboundEventStatus, "received">;
    outcome: string;
    matchedEvents?: string[];
    subscriberId?: number | null;
  },
) => {
  await db
    .update(inboundEvents)
    .set({ ...data, processedAt: new Date() })
    .where(and(eq(inboundEvents.id, id), eq(inboundEvents.status, "received")));
};

export const listInboundEvents = async (
  db: dbClient,
  environmentId: number,
  opts: { source?: string; limit: number; offset: number },
) => {
  return await db
    .select({
      source: inboundEvents.source,
      externalEventId: inboundEvents.externalEventId,
      type: inboundEvents.type,
      status: inboundEvents.status,
      matchedEvents: inboundEvents.matchedEvents,
      outcome: inboundEvents.outcome,
      subscriberPublicId: subscribers.publicId,
      subscriberEmail: subscribers.email,
      createdAt: inboundEvents.createdAt,
      processedAt: inboundEvents.processedAt,
    })
    .from(inboundEvents)
    .leftJoin(subscribers, eq(inboundEvents.subscriberId, subscribers.id))
    .where(
      and(
        eq(inboundEvents.environmentId, environmentId),
        opts.source ? eq(inboundEvents.source, opts.source) : undefined,
      ),
    )
    .orderBy(desc(inboundEvents.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
};

export const getSubscriberByIdentity = async (
  db: dbClient,
  environmentId: number,
  source: string,
  externalId: string,
) => {
  const [row] = await db
    .select({ id: subscribers.id, publicId: subscribers.publicId })
    .from(subscriberIdentities)
    .innerJoin(
      subscribers,
      eq(subscriberIdentities.subscriberId, subscribers.id),
    )
    .where(
      and(
        eq(subscriberIdentities.environmentId, environmentId),
        eq(subscriberIdentities.source, source),
        eq(subscriberIdentities.externalId, externalId),
        isNull(subscribers.deletedAt),
      ),
    )
    .limit(1);
  return row;
};

export const linkSubscriberIdentity = async (
  db: dbClient,
  data: {
    environmentId: number;
    subscriberId: number;
    source: string;
    externalId: string;
  },
) => {
  await db.insert(subscriberIdentities).values(data).onConflictDoNothing();
};
