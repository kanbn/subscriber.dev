import type { Job } from "bullmq";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { BounceEventJobData } from "./workflow.constants.js";
import { recordBounce } from "./recordBounce.js";
import { BOUNCE_EVENTS_QUEUE_NAME } from "./workflow.constants.js";

@Processor(BOUNCE_EVENTS_QUEUE_NAME, { concurrency: 3 })
@Injectable()
export class BounceEventsProcessor extends WorkerHost {
  async process(job: Job<BounceEventJobData>): Promise<void> {
    const db = createDrizzleClient();
    await recordBounce(db, job.data);
  }
}
