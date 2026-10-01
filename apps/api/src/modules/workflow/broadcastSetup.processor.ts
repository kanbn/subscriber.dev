import type { Job } from "bullmq";
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { BroadcastSetupJobData } from "./workflow.constants.js";
import { isUniqueViolation } from "../../common/isUniqueViolation.js";
import {
  createRunForSubscriber,
  queueRunSteps,
} from "./createRunForSubscriber.js";
import {
  BROADCAST_SETUP_QUEUE_NAME,
  BROADCAST_STEPS_QUEUE_NAME,
} from "./workflow.constants.js";

@Processor(BROADCAST_SETUP_QUEUE_NAME, { concurrency: 10 })
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
    if (!subscriber) return;

    const workflow = await workflowRepo.getWorkflowById(
      db,
      broadcast.workflowId,
    );
    if (!workflow) return;

    const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
    if (steps.length === 0) return;

    if (await this.requeueExistingRun(db, broadcast.id, subscriber.id)) {
      return;
    }

    try {
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
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (!(await this.requeueExistingRun(db, broadcast.id, subscriber.id))) {
        throw error;
      }
    }
  }

  private async requeueExistingRun(
    db: dbClient,
    broadcastId: number,
    subscriberId: number,
  ): Promise<boolean> {
    const run = await workflowBroadcastRepo.getRunForSubscriber(
      db,
      broadcastId,
      subscriberId,
    );
    if (!run) return false;
    const unqueued = await workflowRunRepo.listUnqueuedPendingSteps(db, run.id);
    await queueRunSteps(db, this.stepsQueue, unqueued);
    return true;
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<BroadcastSetupJobData> | undefined, error: Error) {
    if (!job?.id) return;
    this.logger.error(
      `Broadcast setup job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}): ${error.message}`,
    );
  }
}
