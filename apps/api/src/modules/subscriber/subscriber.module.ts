import { Module } from "@nestjs/common";

import { WorkflowModule } from "../workflow/workflow.module.js";
import { SubscriberController } from "./subscriber.controller.js";
import { SubscriberService } from "./subscriber.service.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

@Module({
  imports: [WorkflowModule],
  controllers: [SubscriberController, UnsubscribeController],
  providers: [SubscriberService],
  exports: [SubscriberService],
})
export class SubscriberModule {}
