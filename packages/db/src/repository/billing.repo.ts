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

export const getProductionEnvironment = async (
  db: dbClient,
  workspaceId: number,
) =>
  db.query.environments.findFirst({
    where: and(
      eq(environments.workspaceId, workspaceId),
      eq(environments.slug, "prod"),
    ),
  });

export const countSendsSince = async (
  db: dbClient,
  environmentId: number,
  since: Date,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.environmentId, environmentId),
        gte(workflowRunSteps.sentAt, since),
      ),
    );
  return row?.count ?? 0;
};

export const countDistinctEmailedSince = async (
  db: dbClient,
  environmentId: number,
  since: Date,
) => {
  const [row] = await db
    .select({ count: countDistinct(workflowRuns.subscriberId) })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.environmentId, environmentId),
        gte(workflowRunSteps.sentAt, since),
      ),
    );
  return row?.count ?? 0;
};

export const subscriberPosition = async (
  db: dbClient,
  environmentId: number,
  subscriberId: number,
) => {
  const [row] = await db
    .select({ count: count() })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.environmentId, environmentId),
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
