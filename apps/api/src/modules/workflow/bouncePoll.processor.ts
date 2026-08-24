import type { OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import { pollBounces } from "./pollBounces.js";
import {
  BOUNCE_POLL_INTERVAL_MS,
  BOUNCE_POLL_JOB_NAME,
  BOUNCE_POLL_QUEUE_NAME,
} from "./workflow.constants.js";

@Processor(BOUNCE_POLL_QUEUE_NAME, { concurrency: 1 })
@Injectable()
export class BouncePollProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(BOUNCE_POLL_QUEUE_NAME) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      BOUNCE_POLL_JOB_NAME,
      {},
      {
        repeat: { every: BOUNCE_POLL_INTERVAL_MS },
        jobId: BOUNCE_POLL_JOB_NAME,
      },
    );
  }

  async process(_job: Job): Promise<void> {
    const db = createDrizzleClient();
    await pollBounces(db);
  }
}
