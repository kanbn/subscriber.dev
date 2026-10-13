import type { Job } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { sendEmailStep } from "./sendEmailStep.js";
import { renderTemplate } from "./workflow.template.js";

export type SkipSendReason = (
  environmentId: number,
  subscriberId: number,
) => Promise<string | null>;

export async function processRunStepJob(
  db: dbClient,
  runStepId: number,
  skipSendReason?: SkipSendReason,
  showsPoweredBy?: (environmentId: number) => Promise<boolean>,
): Promise<void> {
  const runStep = await workflowRunRepo.getRunStepById(db, runStepId);
  if (!runStep || runStep.status !== "pending") return;

  const run = await workflowRunRepo.getRunById(db, runStep.runId);
  if (!run) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      "Parent run not found",
    );
    return;
  }

  const subscriber = await subscriberRepo.getSubscriberById(
    db,
    run.subscriberId,
  );
  if (!subscriber) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "skipped",
      "Subscriber not found",
    );
    return;
  }

  const skipReason = await skipSendReason?.(run.environmentId, subscriber.id);
  if (skipReason) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "skipped",
      skipReason,
    );
    await workflowRunRepo.completeRunIfAllStepsTerminal(db, run.id);
    return;
  }

  const baseContext = {
    subscriber: {
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      name: subscriber.name,
      email: subscriber.email,
      ...(subscriber.attributes ?? {}),
    },
    ...(run.payload ?? {}),
  };

  if (runStep.type === "email") {
    await sendEmailStep(
      db,
      runStep,
      subscriber,
      baseContext,
      run.workflow,
      await showsPoweredBy?.(run.environmentId),
    );
  } else if (runStep.type === "webhook") {
    const config = runStep.configSnapshot as { url: string; body: string };
    const payload = await renderTemplate(config.body, baseContext);

    try {
      JSON.parse(payload);
      const response = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`);
      }
      await workflowRunRepo.updateRunStepStatus(db, runStep.id, "sent");
    } catch (error) {
      await workflowRunRepo.updateRunStepStatus(
        db,
        runStep.id,
        "failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  } else {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      `Unsupported step type: ${runStep.type}`,
    );
  }

  await workflowRunRepo.completeRunIfAllStepsTerminal(db, run.id);
}

export async function handleRunStepJobFailed(
  db: dbClient,
  job: Job<WorkflowStepJobData> | undefined,
  error: Error,
  logger: { error: (message: string) => void },
): Promise<void> {
  if (!job?.id) return;
  logger.error(`Run-step job ${job.id} failed: ${error.message}`);

  if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
    try {
      const runStep = await workflowRunRepo.getRunStepByBullJobId(db, job.id);
      if (runStep?.status === "pending") {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStep.id,
          "failed",
          error.message,
        );
      }
    } catch (recordError) {
      logger.error(
        `Couldn't record failure of run-step job ${job.id}: ${recordError instanceof Error ? recordError.message : String(recordError)}`,
      );
    }
  }
}
