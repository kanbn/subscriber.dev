import { and, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { environmentIntegrations } from "@subscriber.dev/db/schema";

export const getByEnvironmentAndType = async (
  db: dbClient,
  environmentId: number,
  type: string,
) => {
  return await db.query.environmentIntegrations.findFirst({
    where: and(
      eq(environmentIntegrations.environmentId, environmentId),
      eq(environmentIntegrations.type, type),
    ),
  });
};

export const listByEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  return await db.query.environmentIntegrations.findMany({
    where: eq(environmentIntegrations.environmentId, environmentId),
  });
};

export const listAll = async (db: dbClient) => {
  return await db.query.environmentIntegrations.findMany();
};

export const updateLastBounceCheckAt = async (
  db: dbClient,
  id: number,
  lastBounceCheckAt: Date,
) => {
  await db
    .update(environmentIntegrations)
    .set({ lastBounceCheckAt })
    .where(eq(environmentIntegrations.id, id));
};

export const upsertIntegration = async (
  db: dbClient,
  environmentId: number,
  type: string,
  config: Record<string, unknown>,
  encryptedSecret: string | null,
  updatedBy: number,
) => {
  const [result] = await db
    .insert(environmentIntegrations)
    .values({
      environmentId,
      type,
      config,
      encryptedSecret,
      createdBy: updatedBy,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: [
        environmentIntegrations.environmentId,
        environmentIntegrations.type,
      ],
      set: { config, encryptedSecret, updatedBy, updatedAt: new Date() },
    })
    .returning();

  if (!result) throw new Error("Failed to upsert integration");
  return result;
};

export const deleteIntegration = async (
  db: dbClient,
  environmentId: number,
  type: string,
) => {
  const [result] = await db
    .delete(environmentIntegrations)
    .where(
      and(
        eq(environmentIntegrations.environmentId, environmentId),
        eq(environmentIntegrations.type, type),
      ),
    )
    .returning();

  return result;
};
