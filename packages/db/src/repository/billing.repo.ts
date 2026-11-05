import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environments,
  subscribers,
  workflowRuns,
  workflowRunSteps,
  workspaceBilling,
} from "@subscriber.dev/db/schema";

export type WorkspaceBilling = typeof workspaceBilling.$inferSelect;

export const getBillingForWorkspace = async (
  db: dbClient,
  workspaceId: number,
) =>
  db.query.workspaceBilling.findFirst({
    where: eq(workspaceBilling.workspaceId, workspaceId),
  });

export const getBillingByCustomerId = async (
  db: dbClient,
  stripeCustomerId: string,
) =>
  db.query.workspaceBilling.findFirst({
    where: eq(workspaceBilling.stripeCustomerId, stripeCustomerId),
  });

export const upsertBilling = async (
  db: dbClient,
  workspaceId: number,
  data: Omit<
    typeof workspaceBilling.$inferInsert,
    "id" | "workspaceId" | "createdAt" | "updatedAt"
  >,
) => {
  const [row] = await db
    .insert(workspaceBilling)
    .values({ ...data, workspaceId })
    .onConflictDoUpdate({
      target: workspaceBilling.workspaceId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
};

export const listEnvironmentIds = async (db: dbClient, workspaceId: number) =>
  (
    await db
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          isNull(environments.deletedAt),
        ),
      )
  ).map((row) => row.id);

export const countSendsSince = async (
  db: dbClient,
  workspaceId: number,
  since: Date,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .innerJoin(environments, eq(workflowRuns.environmentId, environments.id))
    .where(
      and(
        eq(environments.workspaceId, workspaceId),
        gte(workflowRunSteps.sentAt, since),
      ),
    );
  return row?.count ?? 0;
};

export const countDistinctEmailedSince = async (
  db: dbClient,
  workspaceId: number,
  since: Date,
) => {
  const [row] = await db
    .select({ count: countDistinct(workflowRuns.subscriberId) })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .innerJoin(environments, eq(workflowRuns.environmentId, environments.id))
    .where(
      and(
        eq(environments.workspaceId, workspaceId),
        gte(workflowRunSteps.sentAt, since),
      ),
    );
  return row?.count ?? 0;
};

export const subscriberPosition = async (
  db: dbClient,
  workspaceId: number,
  subscriberId: number,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(subscribers)
    .innerJoin(environments, eq(subscribers.environmentId, environments.id))
    .where(
      and(
        eq(environments.workspaceId, workspaceId),
        isNull(environments.deletedAt),
        isNull(subscribers.deletedAt),
        lte(subscribers.id, subscriberId),
      ),
    );
  return row?.count ?? 0;
};

export const getEnvironmentById = async (db: dbClient, environmentId: number) =>
  db.query.environments.findFirst({
    where: eq(environments.id, environmentId),
  });

export const listPaidBilling = async (db: dbClient) =>
  db.query.workspaceBilling.findMany({
    where: isNotNull(workspaceBilling.stripeSubscriptionId),
  });

export const setOverLimitSince = async (
  db: dbClient,
  workspaceId: number,
  overLimitSince: Date | null,
) =>
  db
    .update(workspaceBilling)
    .set({ overLimitSince, updatedAt: new Date() })
    .where(eq(workspaceBilling.workspaceId, workspaceId));
