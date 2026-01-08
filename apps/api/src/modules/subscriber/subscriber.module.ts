import { Module } from "@nestjs/common";

import { SubscriberController } from "./subscriber.controller.js";
import { SubscriberService } from "./subscriber.service.js";

@Module({
  controllers: [SubscriberController],
  providers: [SubscriberService],
  exports: [SubscriberService],
})
export class SubscriberModule {}
