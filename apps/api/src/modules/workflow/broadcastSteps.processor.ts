import type { Job } from "bullmq";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { DelayedError } from "bullmq";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { BillingService } from "../billing/billing.service.js";
import { handleRunStepJobFailed, processRunStepJob } from "./processRunStep.js";
import { BROADCAST_STEPS_QUEUE_NAME } from "./workflow.constants.js";

const PAUSED_HOLD_MS = 24 * 60 * 60 * 1000;
const PAUSED_HOLD_JITTER_MS = 6 * 60 * 60 * 1000;
const EARLY_TOLERANCE_MS = 1000;

@Processor(BROADCAST_STEPS_QUEUE_NAME, {
  concurrency: 20,
  limiter: { max: 20, duration: 1000 },
})
@Injectable()
export class BroadcastStepsProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastStepsProcessor.name);

  constructor(private readonly billing: BillingService) {
    super();
  }

  async process(job: Job<WorkflowStepJobData>, token?: string): Promise<void> {
    const db = createDrizzleClient();
    const { runStepId } = job.data;

    const sendState = await workflowBroadcastRepo.getBroadcastSendState(
      db,
      runStepId,
    );
    const state = sendState?.state;
    if (state === "hold") {
      await job.updateData({ ...job.data, parked: true });
      await job.moveToDelayed(
        Date.now() +
          PAUSED_HOLD_MS +
          Math.floor(Math.random() * PAUSED_HOLD_JITTER_MS),
        token,
      );
      throw new DelayedError();
    }
    if (state === "cancel") {
      const runStep = await workflowRunRepo.getRunStepById(db, runStepId);
      if (runStep?.status === "pending") {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStepId,
          "cancelled",
          "Broadcast cancelled",
        );
        await workflowRunRepo.completeRunIfAllStepsTerminal(
          db,
          runStep.runId,
          "cancelled",
        );
      }
      return;
    }
    if (
      sendState &&
      sendState.scheduledAt.getTime() > Date.now() + EARLY_TOLERANCE_MS
    ) {
      await job.moveToDelayed(sendState.scheduledAt.getTime(), token);
      throw new DelayedError();
    }

    await processRunStepJob(db, runStepId, (environmentId, subscriberId) =>
      this.billing.skipSendReason(db, environmentId, subscriberId),
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<WorkflowStepJobData> | undefined, error: Error) {
    if (!job?.id) return;
    const db = createDrizzleClient();
    await handleRunStepJobFailed(db, job, error, this.logger);
  }
}
