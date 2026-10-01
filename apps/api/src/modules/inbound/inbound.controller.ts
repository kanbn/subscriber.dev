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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  ListInboundEventsQueryDto,
  ListInboundEventsResponseDto,
} from "./dto/inbound-events.dto.js";
import { InboundService } from "./inbound.service.js";

@ApiTags("Inbound events")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/inbound-events")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listInboundEvents",
    summary: "List inbound webhook events",
    description:
      "Webhook events received from inbound sources (e.g. Stripe) for this environment, most recent first, with the events they matched and what happened (workflow triggered, no mapping, person not found, etc.).",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: ListInboundEventsResponseDto })
  async listEvents(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Query() query: ListInboundEventsQueryDto,
  ): Promise<ListInboundEventsResponseDto> {
    const db = createDrizzleClient();
    return this.inboundService.listEvents(db, environment.id, {
      source: query.source,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
