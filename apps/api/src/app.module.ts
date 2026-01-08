import { Module } from "@nestjs/common";

import { SubscriberModule } from "./modules/subscriber/subscriber.module.js";
import { TestModule } from "./modules/test/test.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { WorkspaceModule } from "./modules/workspace/workspace.module.js";

@Module({
  imports: [UserModule, TestModule, WorkspaceModule, SubscriberModule],
})
export class AppModule {}
