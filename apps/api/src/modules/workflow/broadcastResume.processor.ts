import type { Job } from "bullmq";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import type { BroadcastResumeJobData } from "./workflow.constants.js";
import {
  BROADCAST_RESUME_QUEUE_NAME,
  BROADCAST_STEPS_QUEUE_NAME,
} from "./workflow.constants.js";

const RESCHEDULE_BATCH_SIZE = 500;

@Processor(BROADCAST_RESUME_QUEUE_NAME, { concurrency: 1 })
@Injectable()
export class BroadcastResumeProcessor extends WorkerHost {
  constructor(
    @InjectQueue(BROADCAST_STEPS_QUEUE_NAME) private readonly stepsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<BroadcastResumeJobData>): Promise<void> {
    const db = createDrizzleClient();
    const steps = await workflowBroadcastRepo.listPendingStepsForBroadcast(
      db,
      job.data.broadcastId,
    );

    for (let i = 0; i < steps.length; i += RESCHEDULE_BATCH_SIZE) {
      const batch = steps.slice(i, i + RESCHEDULE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (step) => {
          if (!step.bullJobId) return;
          const sendJob = await this.stepsQueue.getJob(step.bullJobId);
          if (!sendJob || !(await sendJob.isDelayed())) return;
          if (!sendJob.data.parked && sendJob.attemptsMade > 0) return;
          await sendJob.changeDelay(
            Math.max(0, step.scheduledAt.getTime() - Date.now()),
          );
          if (sendJob.data.parked) {
            await sendJob.updateData({ ...sendJob.data, parked: false });
          }
        }),
      );
    }
  }
}
