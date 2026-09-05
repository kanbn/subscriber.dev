import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { AnalyticsService } from "./analytics.service.js";
import {
  AnalyticsResponseDto,
  GetAnalyticsQueryDto,
} from "./dto/analytics.dto.js";

@ApiTags("Analytics")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
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
    @Param("environmentId") environmentId: string,
    @Query() query: GetAnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.analyticsService.getAnalytics(db, environment.id, query.days);
  }
}
