import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module.js";
import {
  BillingController,
  BillingWebhookController,
} from "./billing.controller.js";
import { BILLING_QUEUE_NAME, BillingProcessor } from "./billing.processor.js";
import { BillingService } from "./billing.service.js";

@Module({
  imports: [
    WorkspaceModule,
    BullModule.registerQueue({ name: BILLING_QUEUE_NAME }),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, BillingProcessor],
  exports: [BillingService],
})
export class BillingModule {}
