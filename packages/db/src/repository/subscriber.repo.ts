import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  max,
  or,
} from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environments,
  subscriberPreferences,
  subscribers,
  workspaceMembers,
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

export type EnvironmentForUser = NonNullable<
  Awaited<ReturnType<typeof getEnvironmentForUser>>
>;

export const getEnvironmentForUser = async (
  db: dbClient,
  userId: number,
  publicId: string,
) => {
  const [result] = await db
    .select({
      id: environments.id,
      publicId: environments.publicId,
      workspaceId: environments.workspaceId,
      name: environments.name,
      slug: environments.slug,
    })
    .from(environments)
    .innerJoin(
      workspaceMembers,
      eq(environments.workspaceId, workspaceMembers.workspaceId),
    )
    .where(
      and(
        eq(environments.publicId, publicId),
        eq(workspaceMembers.userId, userId),
        isNull(environments.deletedAt),
        isNull(workspaceMembers.deletedAt),
      ),
    );

  return result;
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
    publicId?: string | null;
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
      publicId: data.publicId ?? generateUID(),
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
  environmentId: number,
  publicId: string,
) => {
  return await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.environmentId, environmentId),
      eq(subscribers.publicId, publicId),
      isNull(subscribers.deletedAt),
    ),
  });
};

export const findSubscriberForUpsert = async (
  db: dbClient,
  environmentId: number,
  identifiers: {
    publicId?: string | null;
    externalId?: string | null;
    email?: string | null;
  },
) => {
  if (identifiers.publicId) {
    const match = await getSubscriberByPublicId(
      db,
      environmentId,
      identifiers.publicId,
    );
    if (match) return match;
  }

  if (identifiers.externalId) {
    const match = await getSubscriberByExternalId(
      db,
      environmentId,
      identifiers.externalId,
    );
    if (match) return match;
  }

  if (identifiers.email) {
    const match = await getSubscriberByEmail(
      db,
      environmentId,
      identifiers.email,
    );
    if (match) return match;
  }

  return undefined;
};

export const latestPreferencePerSubscriber = (
  db: dbClient,
  environmentId: number,
) => {
  return db
    .selectDistinctOn([subscriberPreferences.subscriberId], {
      subscriberId: subscriberPreferences.subscriberId,
      email: subscriberPreferences.email,
      createdAt: subscriberPreferences.createdAt,
    })
    .from(subscriberPreferences)
    .innerJoin(
      subscribers,
      eq(subscribers.id, subscriberPreferences.subscriberId),
    )
    .where(eq(subscribers.environmentId, environmentId))
    .orderBy(
      subscriberPreferences.subscriberId,
      desc(subscriberPreferences.version),
    )
    .as("latest_preference_per_subscriber");
};

export const latestOptedInOrOutSubscriberIds = (
  db: dbClient,
  environmentId: number,
  emailOptedIn: boolean,
) => {
  const latest = latestPreferencePerSubscriber(db, environmentId);

  return db
    .select({ subscriberId: latest.subscriberId })
    .from(latest)
    .where(eq(latest.email, emailOptedIn));
};

export const getSubscriberCounts = async (
  db: dbClient,
  environmentId: number,
  sinceDate: Date,
): Promise<{ total: number; newInPeriod: number }> => {
  const [totalRow] = await db
    .select({ count: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.environmentId, environmentId),
        isNull(subscribers.deletedAt),
      ),
    );

  const [recentRow] = await db
    .select({ count: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.environmentId, environmentId),
        isNull(subscribers.deletedAt),
        gte(subscribers.createdAt, sinceDate),
      ),
    );

  return { total: totalRow?.count ?? 0, newInPeriod: recentRow?.count ?? 0 };
};

export const getOptedOutCounts = async (
  db: dbClient,
  environmentId: number,
  sinceDate: Date,
): Promise<{ total: number; recent: number }> => {
  const latest = latestPreferencePerSubscriber(db, environmentId);

  const [totalRow] = await db
    .select({ count: count() })
    .from(latest)
    .where(eq(latest.email, false));

  const [recentRow] = await db
    .select({ count: count() })
    .from(latest)
    .where(and(eq(latest.email, false), gte(latest.createdAt, sinceDate)));

  return { total: totalRow?.count ?? 0, recent: recentRow?.count ?? 0 };
};

export const listSubscribers = async (
  db: dbClient,
  environmentId: number,
  opts: {
    limit: number;
    offset: number;
    email?: string;
    externalId?: string;
    emailOptedIn?: boolean;
    q?: string;
  },
) => {
  return await db.query.subscribers.findMany({
    where: and(
      eq(subscribers.environmentId, environmentId),
      isNull(subscribers.deletedAt),
      opts.email ? eq(subscribers.email, opts.email) : undefined,
      opts.externalId ? eq(subscribers.externalId, opts.externalId) : undefined,
      opts.emailOptedIn !== undefined
        ? inArray(
            subscribers.id,
            latestOptedInOrOutSubscriberIds(
              db,
              environmentId,
              opts.emailOptedIn,
            ),
          )
        : undefined,
      opts.q
        ? or(
            ilike(subscribers.email, `%${opts.q}%`),
            ilike(subscribers.phone, `%${opts.q}%`),
            ilike(subscribers.externalId, `%${opts.q}%`),
            ilike(subscribers.firstName, `%${opts.q}%`),
            ilike(subscribers.lastName, `%${opts.q}%`),
            ilike(subscribers.name, `%${opts.q}%`),
          )
        : undefined,
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
