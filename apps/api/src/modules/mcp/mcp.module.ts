import { Module } from "@nestjs/common";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";

import { AnalyticsModule } from "../analytics/analytics.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { billingEnabled } from "../billing/billing.service.js";
import { InboundModule } from "../inbound/inbound.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { SubscriberModule } from "../subscriber/subscriber.module.js";
import { UserModule } from "../user/user.module.js";
import { WorkflowModule } from "../workflow/workflow.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { McpAuthGuard } from "./mcp-auth.guard.js";
import { OAuthMetadataController } from "./oauth-metadata.controller.js";
import { AnalyticsTools } from "./tools/analytics.tools.js";
import { BillingTools } from "./tools/billing.tools.js";
import { InboundTools } from "./tools/inbound.tools.js";
import { IntegrationsTools } from "./tools/integrations.tools.js";
import { SubscriberTools } from "./tools/subscriber.tools.js";
import { UserTools } from "./tools/user.tools.js";
import { WorkflowTools } from "./tools/workflow.tools.js";
import { WorkspaceTools } from "./tools/workspace.tools.js";

const SERVER_NAME = "subscriber-dev";

const TOOL_PROVIDERS = [
  SubscriberTools,
  WorkflowTools,
  UserTools,
  IntegrationsTools,
  AnalyticsTools,
  InboundTools,
  WorkspaceTools,
  ...(billingEnabled() ? [BillingTools] : []),
];

@Module({
  imports: [
    McpModule.forRoot({
      name: SERVER_NAME,
      version: "0.1.0",
      transport: [McpTransportType.STREAMABLE_HTTP],
      guards: [McpAuthGuard],
    }),
    SubscriberModule,
    WorkflowModule,
    UserModule,
    IntegrationsModule,
    AnalyticsModule,
    InboundModule,
    WorkspaceModule,
    BillingModule,
  ],
  controllers: [OAuthMetadataController],
  providers: TOOL_PROVIDERS,
})
export class SubscriberMcpModule {}
