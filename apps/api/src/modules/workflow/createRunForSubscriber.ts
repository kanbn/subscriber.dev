import type { Queue } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { WORKFLOW_STEP_JOB_NAME } from "./workflow.constants.js";

interface WorkflowStepForRun {
  id: number;
  stepOrder: number;
  type: string;
  delayMs: number;
  config: Record<string, unknown>;
}

interface CreateRunForSubscriberInput {
  workflowId: number;
  steps: WorkflowStepForRun[];
  environmentId: number;
  subscriberId: number;
  payload?: Record<string, unknown> | null;
  createdBy: number | null;
  broadcastId?: number | null;
  startDelayMs?: number;
}

export async function createRunForSubscriber(
  db: dbClient,
  queue: Queue,
  input: CreateRunForSubscriberInput,
) {
  let cumulativeDelayMs = input.startDelayMs ?? 0;
  const now = new Date();
  const plannedSteps = input.steps.map((step) => {
    cumulativeDelayMs += step.delayMs;
    return {
      stepId: step.id,
      stepOrder: step.stepOrder,
      type: step.type,
      configSnapshot: step.config,
      scheduledAt: new Date(now.getTime() + cumulativeDelayMs),
    };
  });

  const { run, runSteps } = await workflowRunRepo.createRunWithSteps(db, {
    workflowId: input.workflowId,
    environmentId: input.environmentId,
    subscriberId: input.subscriberId,
    payload: input.payload ?? null,
    createdBy: input.createdBy,
    broadcastId: input.broadcastId ?? null,
    steps: plannedSteps,
  });

  await queueRunSteps(db, queue, runSteps);

  return { run, runSteps };
}

export async function queueRunSteps(
  db: dbClient,
  queue: Queue,
  steps: { id: number; scheduledAt: Date }[],
) {
  for (const step of steps) {
    const job = await queue.add(
      WORKFLOW_STEP_JOB_NAME,
      { runStepId: step.id } satisfies WorkflowStepJobData,
      {
        delay: Math.max(0, step.scheduledAt.getTime() - Date.now()),
        jobId: `run-step-${step.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    if (job.id) {
      await workflowRunRepo.setRunStepBullJobId(db, step.id, job.id);
    }
  }
}
