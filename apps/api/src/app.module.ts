import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { HealthController } from "./health.controller.js";
import { AnalyticsModule } from "./modules/analytics/analytics.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { InboundModule } from "./modules/inbound/inbound.module.js";
import { IntegrationsModule } from "./modules/integrations/integrations.module.js";
import { SubscriberMcpModule } from "./modules/mcp/mcp.module.js";
import { SubscriberModule } from "./modules/subscriber/subscriber.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";
import { UserModule } from "./modules/user/user.module.js";
import { WorkflowModule } from "./modules/workflow/workflow.module.js";
import { WorkspaceModule } from "./modules/workspace/workspace.module.js";
import { getRedisConnection } from "./queue/bullmq.connection.js";
import { throttlerOptions } from "./throttle.js";

@Module({
  imports: [
    BullModule.forRoot({ connection: getRedisConnection() }),
    ThrottlerModule.forRoot(throttlerOptions()),
    UserModule,
    WorkspaceModule,
    BillingModule,
    SubscriberModule,
    WorkflowModule,
    IntegrationsModule,
    UploadsModule,
    AnalyticsModule,
    InboundModule,
    SubscriberMcpModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
