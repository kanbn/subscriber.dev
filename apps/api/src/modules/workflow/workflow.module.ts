import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module.js";
import { BounceEventsProcessor } from "./bounceEvents.processor.js";
import { BouncePollProcessor } from "./bouncePoll.processor.js";
import { BouncesController } from "./bounces.controller.js";
import { BroadcastDispatchProcessor } from "./broadcastDispatch.processor.js";
import { BroadcastResumeProcessor } from "./broadcastResume.processor.js";
import { BroadcastSetupProcessor } from "./broadcastSetup.processor.js";
import { BroadcastStepsProcessor } from "./broadcastSteps.processor.js";
import {
  BOUNCE_EVENTS_QUEUE_NAME,
  BOUNCE_POLL_QUEUE_NAME,
  BROADCAST_DISPATCH_QUEUE_NAME,
  BROADCAST_RESUME_QUEUE_NAME,
  BROADCAST_SETUP_QUEUE_NAME,
  BROADCAST_STEPS_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
} from "./workflow.constants.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowProcessor } from "./workflow.processor.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  imports: [
    BillingModule,
    BullModule.registerQueue(
      { name: WORKFLOW_QUEUE_NAME },
      { name: BROADCAST_DISPATCH_QUEUE_NAME },
      { name: BROADCAST_SETUP_QUEUE_NAME },
      { name: BROADCAST_STEPS_QUEUE_NAME },
      { name: BROADCAST_RESUME_QUEUE_NAME },
      { name: BOUNCE_EVENTS_QUEUE_NAME },
      { name: BOUNCE_POLL_QUEUE_NAME },
    ),
  ],
  controllers: [WorkflowController, BouncesController],
  providers: [
    WorkflowService,
    WorkflowProcessor,
    BroadcastDispatchProcessor,
    BroadcastSetupProcessor,
    BroadcastStepsProcessor,
    BroadcastResumeProcessor,
    BounceEventsProcessor,
    BouncePollProcessor,
  ],
  exports: [WorkflowService],
})
export class WorkflowModule {}
