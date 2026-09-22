import { Module } from "@nestjs/common";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { SubscriberModule } from "../subscriber/subscriber.module.js";
import { UserModule } from "../user/user.module.js";
import { WorkflowModule } from "../workflow/workflow.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { AnalyticsTools } from "./tools/analytics.tools.js";
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
  WorkspaceTools,
];

@Module({
  imports: [
    McpModule.forRoot({
      name: SERVER_NAME,
      version: "0.1.0",
      transport: [McpTransportType.STREAMABLE_HTTP],
      guards: [AuthGuard],
    }),
    SubscriberModule,
    WorkflowModule,
    UserModule,
    IntegrationsModule,
    AnalyticsModule,
    WorkspaceModule,
  ],
  providers: TOOL_PROVIDERS,
})
export class SubscriberMcpModule {}
