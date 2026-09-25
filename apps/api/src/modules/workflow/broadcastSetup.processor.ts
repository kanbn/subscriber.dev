import type { Job } from "bullmq";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import type { BroadcastSetupJobData } from "./workflow.constants.js";
import { createRunForSubscriber } from "./createRunForSubscriber.js";
import {
  BROADCAST_SETUP_QUEUE_NAME,
  BROADCAST_STEPS_QUEUE_NAME,
} from "./workflow.constants.js";

@Processor(BROADCAST_SETUP_QUEUE_NAME, { concurrency: 50 })
@Injectable()
export class BroadcastSetupProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastSetupProcessor.name);

  constructor(
    @InjectQueue(BROADCAST_STEPS_QUEUE_NAME) private readonly stepsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<BroadcastSetupJobData>): Promise<void> {
    const db = createDrizzleClient();

    const broadcast = await workflowBroadcastRepo.getBroadcastById(
      db,
      job.data.broadcastId,
    );
    if (!broadcast) {
      this.logger.warn(`Broadcast ${job.data.broadcastId} no longer exists`);
      return;
    }
    if (broadcast.status === "cancelled" || broadcast.status === "failed") {
      return;
    }

    const subscriber = await subscriberRepo.getSubscriberById(
      db,
      job.data.subscriberId,
    );
    const workflow =
      subscriber &&
      (await workflowRepo.getWorkflowById(db, broadcast.workflowId));
    const steps = workflow
      ? await workflowRepo.listStepsForWorkflow(db, workflow.id)
      : [];
    if (!subscriber || !workflow || steps.length === 0) {
      await workflowBroadcastRepo.incrementBroadcastSkipped(db, broadcast.id);
      return;
    }

    await createRunForSubscriber(db, this.stepsQueue, {
      workflowId: workflow.id,
      steps,
      environmentId: broadcast.environmentId,
      subscriberId: subscriber.id,
      payload: null,
      createdBy: broadcast.createdBy,
      broadcastId: broadcast.id,
      startDelayMs: job.data.startDelayMs,
    });
  }
}
