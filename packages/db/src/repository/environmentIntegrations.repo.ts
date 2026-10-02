import { and, asc, eq, sql } from "drizzle-orm";

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

export const getByWebhookToken = async (
  db: dbClient,
  type: string,
  token: string,
) => {
  return await db.query.environmentIntegrations.findFirst({
    where: and(
      eq(environmentIntegrations.type, type),
      sql`${environmentIntegrations.config}->>'webhookToken' = ${token}`,
    ),
  });
};

export const listByEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  return await db.query.environmentIntegrations.findMany({
    where: eq(environmentIntegrations.environmentId, environmentId),
    orderBy: [
      asc(environmentIntegrations.priority),
      asc(environmentIntegrations.id),
    ],
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
  // Only applied on insert - reconfiguring an existing integration must
  // never change its place in the failover order.
  priorityIfNew: number,
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
      priority: priorityIfNew,
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

// Moves `type` to the front of the failover order, preserving the relative
// order of the rest. Returns undefined if the type isn't configured.
export const setPrimary = async (
  db: dbClient,
  environmentId: number,
  type: string,
) => {
  const rows = await listByEnvironment(db, environmentId);
  const target = rows.find((row) => row.type === type);
  if (!target) return undefined;

  const reordered = [target, ...rows.filter((row) => row.type !== type)];

  await db.transaction(async (tx) => {
    for (let i = 0; i < reordered.length; i++) {
      await tx
        .update(environmentIntegrations)
        .set({ priority: i + 1 })
        .where(eq(environmentIntegrations.id, reordered[i]!.id));
    }
  });

  return { ...target, priority: 1 };
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
