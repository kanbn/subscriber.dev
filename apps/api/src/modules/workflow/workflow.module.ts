import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { WORKFLOW_QUEUE_NAME } from "./workflow.constants.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowProcessor } from "./workflow.processor.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: WORKFLOW_QUEUE_NAME })],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowProcessor],
  exports: [WorkflowService],
})
export class WorkflowModule {}
