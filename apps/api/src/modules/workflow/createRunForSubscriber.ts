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
      cumulativeDelayMs,
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

  for (const [i, runStep] of runSteps.entries()) {
    const job = await queue.add(
      WORKFLOW_STEP_JOB_NAME,
      { runStepId: runStep.id } satisfies WorkflowStepJobData,
      {
        delay: plannedSteps[i]!.cumulativeDelayMs,
        jobId: `run-step-${runStep.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    if (job.id) {
      await workflowRunRepo.setRunStepBullJobId(db, runStep.id, job.id);
    }
  }

  return { run, runSteps };
}
