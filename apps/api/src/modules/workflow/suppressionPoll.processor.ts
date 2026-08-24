import type { OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import { pollSuppressions } from "./pollSuppressions.js";
import {
  SUPPRESSION_POLL_INTERVAL_MS,
  SUPPRESSION_POLL_JOB_NAME,
  SUPPRESSION_POLL_QUEUE_NAME,
} from "./workflow.constants.js";

@Processor(SUPPRESSION_POLL_QUEUE_NAME, { concurrency: 1 })
@Injectable()
export class SuppressionPollProcessor
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    @InjectQueue(SUPPRESSION_POLL_QUEUE_NAME) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SUPPRESSION_POLL_JOB_NAME,
      {},
      {
        repeat: { every: SUPPRESSION_POLL_INTERVAL_MS },
        jobId: SUPPRESSION_POLL_JOB_NAME,
      },
    );
  }

  async process(_job: Job): Promise<void> {
    const db = createDrizzleClient();
    await pollSuppressions(db);
  }
}
