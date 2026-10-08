import type { OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import { BillingService } from "./billing.service.js";

export const BILLING_QUEUE_NAME = "billing";
const ENFORCE_JOB_NAME = "enforce-paid-plans";
const ENFORCE_EVERY_MS = 60 * 60 * 1000;

@Processor(BILLING_QUEUE_NAME, { concurrency: 1 })
@Injectable()
export class BillingProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(BILLING_QUEUE_NAME) private readonly queue: Queue,
    private readonly billingService: BillingService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (!this.billingService.isEnabled()) return;
    await this.queue.add(
      ENFORCE_JOB_NAME,
      {},
      { repeat: { every: ENFORCE_EVERY_MS }, jobId: ENFORCE_JOB_NAME },
    );
  }

  async process(): Promise<void> {
    await this.billingService.enforcePaidPlans(createDrizzleClient());
  }
}
