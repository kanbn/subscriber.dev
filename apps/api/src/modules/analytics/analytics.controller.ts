import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import { AnalyticsService } from "./analytics.service.js";
import {
  AnalyticsResponseDto,
  GetAnalyticsQueryDto,
} from "./dto/analytics.dto.js";

@ApiTags("Analytics")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/analytics")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @RequiresScope("analytics:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getAnalytics",
    summary: "Get environment-wide analytics",
    description:
      "Subscriber counts, opt-outs, send outcomes, and bounce breakdown for an environment. `days` scopes the new-subscriber and recently-opted-out counts; send/bounce totals are all-time.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiResponse({ status: 200, type: AnalyticsResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async getAnalytics(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Query() query: GetAnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    const db = createDrizzleClient();

    return this.analyticsService.getAnalytics(db, environment.id, query.days);
  }
}
