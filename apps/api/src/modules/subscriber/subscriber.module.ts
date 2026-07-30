import { Module } from "@nestjs/common";

import { SubscriberController } from "./subscriber.controller.js";
import { SubscriberService } from "./subscriber.service.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

@Module({
  controllers: [SubscriberController, UnsubscribeController],
  providers: [SubscriberService],
  exports: [SubscriberService],
})
export class SubscriberModule {}
