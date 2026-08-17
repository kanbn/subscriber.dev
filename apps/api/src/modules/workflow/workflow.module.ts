import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { BroadcastDispatchProcessor } from "./broadcastDispatch.processor.js";
import { BroadcastSetupProcessor } from "./broadcastSetup.processor.js";
import { BroadcastStepsProcessor } from "./broadcastSteps.processor.js";
import {
  BROADCAST_DISPATCH_QUEUE_NAME,
  BROADCAST_SETUP_QUEUE_NAME,
  BROADCAST_STEPS_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
} from "./workflow.constants.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowProcessor } from "./workflow.processor.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: WORKFLOW_QUEUE_NAME },
      { name: BROADCAST_DISPATCH_QUEUE_NAME },
      { name: BROADCAST_SETUP_QUEUE_NAME },
      { name: BROADCAST_STEPS_QUEUE_NAME },
    ),
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowProcessor,
    BroadcastDispatchProcessor,
    BroadcastSetupProcessor,
    BroadcastStepsProcessor,
  ],
  exports: [WorkflowService],
})
export class WorkflowModule {}
