import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

export interface RecordBounceInput {
  runStepId: number;
  bounceType: "hard" | "soft";
  reason: string;
}

export async function recordBounce(
  db: dbClient,
  input: RecordBounceInput,
): Promise<void> {
  const runStep = await workflowRunRepo.getRunStepById(db, input.runStepId);
  if (!runStep) return;

  await workflowRunRepo.markRunStepBounced(db, runStep.id, {
    bounceType: input.bounceType,
    reason: input.reason,
  });

  if (input.bounceType !== "hard") return;

  const run = await workflowRunRepo.getRunById(db, runStep.runId);
  if (!run) return;

  await subscriberRepo.createSubscriberPreferences(db, {
    subscriberId: run.subscriberId,
    email: false,
  });
}
