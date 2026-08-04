import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { IntegrationsModule } from "./modules/integrations/integrations.module.js";
import { SubscriberModule } from "./modules/subscriber/subscriber.module.js";
import { TestModule } from "./modules/test/test.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { WorkflowModule } from "./modules/workflow/workflow.module.js";
import { WorkspaceModule } from "./modules/workspace/workspace.module.js";
import { getRedisConnection } from "./queue/bullmq.connection.js";

@Module({
  imports: [
    BullModule.forRoot({ connection: getRedisConnection() }),
    UserModule,
    TestModule,
    WorkspaceModule,
    SubscriberModule,
    WorkflowModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
