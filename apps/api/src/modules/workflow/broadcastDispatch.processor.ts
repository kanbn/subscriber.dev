import type { Job } from "bullmq";
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import type { AudienceCondition } from "./audienceQuery.js";
import type {
  BroadcastDispatchJobData,
  BroadcastSetupJobData,
} from "./workflow.constants.js";
import { resolveAudienceSubscriberIds } from "./audienceQuery.js";
import {
  BROADCAST_DISPATCH_QUEUE_NAME,
  BROADCAST_SETUP_JOB_NAME,
  BROADCAST_SETUP_QUEUE_NAME,
} from "./workflow.constants.js";

const SETUP_JOB_CHUNK_SIZE = 2000;

@Processor(BROADCAST_DISPATCH_QUEUE_NAME, { concurrency: 3 })
@Injectable()
export class BroadcastDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastDispatchProcessor.name);

  constructor(
    @InjectQueue(BROADCAST_SETUP_QUEUE_NAME) private readonly setupQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<BroadcastDispatchJobData>): Promise<void> {
    const db = createDrizzleClient();
    const broadcast = await workflowBroadcastRepo.getBroadcastById(
      db,
      job.data.broadcastId,
    );
    if (!broadcast) return;

    const subscriberIds = await resolveAudienceSubscriberIds(
      db,
      broadcast.environmentId,
      broadcast.audienceQuery as AudienceCondition,
    );

    for (let i = 0; i < subscriberIds.length; i += SETUP_JOB_CHUNK_SIZE) {
      const chunk = subscriberIds.slice(i, i + SETUP_JOB_CHUNK_SIZE);
      await this.setupQueue.addBulk(
        chunk.map((subscriberId) => ({
          name: BROADCAST_SETUP_JOB_NAME,
          data: {
            broadcastId: broadcast.id,
            subscriberId,
          } satisfies BroadcastSetupJobData,
          opts: {
            jobId: `broadcast-${broadcast.id}-subscriber-${subscriberId}`,
            attempts: 3,
            backoff: { type: "exponential" as const, delay: 60_000 },
            removeOnComplete: true,
            removeOnFail: 1000,
          },
        })),
      );
    }

    await workflowBroadcastRepo.updateBroadcastProgress(db, broadcast.id, {
      matchedCount: subscriberIds.length,
      status: "queued",
    });
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<BroadcastDispatchJobData> | undefined, error: Error) {
    if (!job?.id) return;
    this.logger.error(
      `Broadcast dispatch job ${job.id} failed: ${error.message}`,
    );

    if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
      const db = createDrizzleClient();
      await workflowBroadcastRepo.updateBroadcastProgress(
        db,
        job.data.broadcastId,
        { status: "failed" },
      );
    }
  }
}
