import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { SubscriberModule } from "../subscriber/subscriber.module.js";
import { WorkflowModule } from "../workflow/workflow.module.js";
import { INBOUND_EVENTS_QUEUE_NAME } from "./inbound.constants.js";
import { InboundController } from "./inbound.controller.js";
import { InboundService } from "./inbound.service.js";
import { InboundEventsProcessor } from "./inboundEvents.processor.js";
import { InboundWebhookController } from "./inboundWebhook.controller.js";
import { TriggerSourcesController } from "./triggerSources.controller.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: INBOUND_EVENTS_QUEUE_NAME }),
    WorkflowModule,
    SubscriberModule,
  ],
  controllers: [
    InboundWebhookController,
    InboundController,
    TriggerSourcesController,
  ],
  providers: [InboundService, InboundEventsProcessor],
  exports: [InboundService],
})
export class InboundModule {}
