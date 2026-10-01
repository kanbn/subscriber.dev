import { Module } from "@nestjs/common";

import { InboundService } from "./inbound.service.js";
import { TriggerSourcesController } from "./triggerSources.controller.js";

@Module({
  controllers: [TriggerSourcesController],
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
