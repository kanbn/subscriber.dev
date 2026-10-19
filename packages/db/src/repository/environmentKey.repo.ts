import { and, eq, isNull, lt, or } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import type { EnvironmentKeyScope } from "@subscriber.dev/shared/environmentKeys";
import {
  environmentKeys,
  environments,
  workspaces,
} from "@subscriber.dev/db/schema";

export const createEnvironmentKey = async (
  db: dbClient,
  data: {
    environmentId: number;
    name: string;
    keyHash: string;
    start: string;
    scopes: EnvironmentKeyScope[];
    createdBy: number | null;
  },
) => {
  const [key] = await db.insert(environmentKeys).values(data).returning();
  if (!key) throw new Error("Failed to create environment key");
  return key;
};

export const getEnvironmentKeyByHash = async (
  db: dbClient,
  keyHash: string,
) => {
  const [result] = await db
    .select({
      id: environmentKeys.id,
      scopes: environmentKeys.scopes,
      lastUsedAt: environmentKeys.lastUsedAt,
      environment: {
        id: environments.id,
        publicId: environments.publicId,
        workspaceId: environments.workspaceId,
        name: environments.name,
        slug: environments.slug,
      },
      workspacePublicId: workspaces.publicId,
    })
    .from(environmentKeys)
    .innerJoin(environments, eq(environmentKeys.environmentId, environments.id))
    .innerJoin(workspaces, eq(environments.workspaceId, workspaces.id))
    .where(
      and(
        eq(environmentKeys.keyHash, keyHash),
        isNull(environments.deletedAt),
        isNull(workspaces.deletedAt),
      ),
    );
  return result;
};

export type EnvironmentKeyForRequest = NonNullable<
  Awaited<ReturnType<typeof getEnvironmentKeyByHash>>
>;

export const markEnvironmentKeyUsed = async (
  db: dbClient,
  id: number,
  before: Date,
) => {
  await db
    .update(environmentKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(environmentKeys.id, id),
        or(
          isNull(environmentKeys.lastUsedAt),
          lt(environmentKeys.lastUsedAt, before),
        ),
      ),
    );
};
