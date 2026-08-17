import type { Job } from "bullmq";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { handleRunStepJobFailed, processRunStepJob } from "./processRunStep.js";
import { BROADCAST_STEPS_QUEUE_NAME } from "./workflow.constants.js";

@Processor(BROADCAST_STEPS_QUEUE_NAME, {
  concurrency: 20,
  limiter: { max: 20, duration: 1000 },
})
@Injectable()
export class BroadcastStepsProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastStepsProcessor.name);

  async process(job: Job<WorkflowStepJobData>): Promise<void> {
    const db = createDrizzleClient();
    await processRunStepJob(db, job.data.runStepId);
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<WorkflowStepJobData> | undefined, error: Error) {
    if (!job?.id) return;
    const db = createDrizzleClient();
    await handleRunStepJobFailed(db, job, error, this.logger);
  }
}
