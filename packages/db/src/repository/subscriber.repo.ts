import { and, asc, desc, eq, isNull, max } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environments,
  subscriberPreferences,
  subscribers,
} from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

export const getEnvironmentById = async (
  db: dbClient,
  environmentId: number,
) => {
  return await db.query.environments.findFirst({
    where: and(
      eq(environments.id, environmentId),
      isNull(environments.deletedAt),
    ),
  });
};

export const getEnvironmentByPublicId = async (
  db: dbClient,
  publicId: string,
) => {
  return await db.query.environments.findFirst({
    where: and(
      eq(environments.publicId, publicId),
      isNull(environments.deletedAt),
    ),
  });
};

export const getSubscriberByEmail = async (
  db: dbClient,
  environmentId: number,
  email: string,
) => {
  return await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.environmentId, environmentId),
      eq(subscribers.email, email),
      isNull(subscribers.deletedAt),
    ),
  });
};

export const getSubscriberByExternalId = async (
  db: dbClient,
  environmentId: number,
  externalId: string,
) => {
  return await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.environmentId, environmentId),
      eq(subscribers.externalId, externalId),
      isNull(subscribers.deletedAt),
    ),
  });
};

export const createSubscriber = async (
  db: dbClient,
  data: {
    environmentId: number;
    email?: string | null;
    phone?: string | null;
    externalId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    attributes?: Record<string, unknown> | null;
    createdBy: number;
  },
) => {
  const [result] = await db
    .insert(subscribers)
    .values({
      publicId: generateUID(),
      environmentId: data.environmentId,
      email: data.email ?? null,
      phone: data.phone ?? null,
      externalId: data.externalId ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      name: data.name ?? null,
      attributes: data.attributes ?? null,
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    })
    .returning();

  return result;
};

export const getLatestPreferenceVersion = async (
  db: dbClient,
  subscriberId: number,
): Promise<number> => {
  const result = await db
    .select({ maxVersion: max(subscriberPreferences.version) })
    .from(subscriberPreferences)
    .where(eq(subscriberPreferences.subscriberId, subscriberId));

  return result[0]?.maxVersion ?? 0;
};

export const createSubscriberPreferences = async (
  db: dbClient,
  data: {
    subscriberId: number;
    email: boolean;
  },
) => {
  // Get the latest version for this subscriber
  const latestVersion = await getLatestPreferenceVersion(db, data.subscriberId);
  const nextVersion = latestVersion + 1;

  const [result] = await db
    .insert(subscriberPreferences)
    .values({
      publicId: generateUID(),
      subscriberId: data.subscriberId,
      email: data.email,
      version: nextVersion,
    })
    .returning();

  return result;
};

export const getSubscriberById = async (db: dbClient, id: number) => {
  return await db.query.subscribers.findFirst({
    where: eq(subscribers.id, id),
  });
};

export const getSubscriberByPublicId = async (
  db: dbClient,
  publicId: string,
) => {
  return await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.publicId, publicId),
      isNull(subscribers.deletedAt),
    ),
  });
};

export const listSubscribers = async (
  db: dbClient,
  environmentId: number,
  opts: { limit: number; offset: number },
) => {
  return await db.query.subscribers.findMany({
    where: and(
      eq(subscribers.environmentId, environmentId),
      isNull(subscribers.deletedAt),
    ),
    orderBy: asc(subscribers.createdAt),
    limit: opts.limit,
    offset: opts.offset,
  });
};

export const updateSubscriber = async (
  db: dbClient,
  id: number,
  data: {
    email?: string | null;
    phone?: string | null;
    externalId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    attributes?: Record<string, unknown> | null;
    updatedBy: number;
  },
) => {
  const [result] = await db
    .update(subscribers)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(subscribers.id, id), isNull(subscribers.deletedAt)))
    .returning();

  return result;
};

export const softDeleteSubscriber = async (
  db: dbClient,
  id: number,
  deletedBy: number,
) => {
  const [result] = await db
    .update(subscribers)
    .set({ deletedAt: new Date(), deletedBy, updatedAt: new Date() })
    .where(and(eq(subscribers.id, id), isNull(subscribers.deletedAt)))
    .returning();

  return result;
};

export const getLatestPreferences = async (
  db: dbClient,
  subscriberId: number,
) => {
  return await db.query.subscriberPreferences.findFirst({
    where: eq(subscriberPreferences.subscriberId, subscriberId),
    orderBy: desc(subscriberPreferences.version),
  });
};
