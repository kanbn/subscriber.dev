import type { Job } from "bullmq";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { BillingService } from "../billing/billing.service.js";
import { handleRunStepJobFailed, processRunStepJob } from "./processRunStep.js";
import { WORKFLOW_QUEUE_NAME } from "./workflow.constants.js";

@Processor(WORKFLOW_QUEUE_NAME, { concurrency: 5 })
@Injectable()
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(private readonly billing: BillingService) {
    super();
  }

  async process(job: Job<WorkflowStepJobData>): Promise<void> {
    const db = createDrizzleClient();
    await processRunStepJob(
      db,
      job.data.runStepId,
      (environmentId, subscriberId) =>
        this.billing.skipSendReason(db, environmentId, subscriberId),
      (environmentId) => this.billing.showsPoweredBy(db, environmentId),
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<WorkflowStepJobData> | undefined, error: Error) {
    if (!job?.id) return;
    const db = createDrizzleClient();
    await handleRunStepJobFailed(db, job, error, this.logger);
  }
}
