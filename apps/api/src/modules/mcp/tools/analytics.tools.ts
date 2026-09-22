import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { AnalyticsService } from "../../analytics/analytics.service.js";
import { GetAnalyticsQuerySchema } from "../../analytics/dto/analytics.dto.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class AnalyticsTools {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Tool({
    name: "get_analytics",
    description:
      "Get environment-wide analytics: subscriber counts, opt-outs, send outcomes, and bounce breakdown. `days` scopes the new-subscriber and recently-opted-out counts; send/bounce totals are all-time.",
    parameters: GetAnalyticsQuerySchema.extend({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async getAnalytics(
    args: z.infer<typeof GetAnalyticsQuerySchema> & { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.analyticsService.getAnalytics(db, environment.id, args.days);
  }
}
