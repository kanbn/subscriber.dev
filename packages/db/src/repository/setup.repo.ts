import { and, count, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environmentIntegrations,
  workflowRuns,
  workflowRunSteps,
  workflows,
} from "@subscriber.dev/db/schema";

export const hasSentEmail = async (db: dbClient, environmentId: number) => {
  const [row] = await db
    .select({ id: workflowRunSteps.id })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRunSteps.runId, workflowRuns.id))
    .where(
      and(
        eq(workflowRuns.environmentId, environmentId),
        eq(workflowRunSteps.type, "email"),
        eq(workflowRunSteps.status, "sent"),
      ),
    )
    .limit(1);
  return row !== undefined;
};

export const getSetupFacts = async (db: dbClient, environmentId: number) => {
  const [integrations, [workflowCount], sentEmail] = await Promise.all([
    db
      .select({
        type: environmentIntegrations.type,
        config: environmentIntegrations.config,
      })
      .from(environmentIntegrations)
      .where(eq(environmentIntegrations.environmentId, environmentId)),
    db
      .select({ count: count() })
      .from(workflows)
      .where(
        and(
          eq(workflows.environmentId, environmentId),
          isNull(workflows.deletedAt),
        ),
      ),
    hasSentEmail(db, environmentId),
  ]);
  return {
    integrationTypes: integrations.map((row) => row.type),
    stripeWebhook: integrations.some(
      (row) => row.type === "stripe" && !!row.config.webhookStatus,
    ),
    workflowCount: workflowCount?.count ?? 0,
    hasSentEmail: sentEmail,
  };
};
