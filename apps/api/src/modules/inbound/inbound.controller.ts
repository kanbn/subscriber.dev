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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  ListInboundEventsQueryDto,
  ListInboundEventsResponseDto,
} from "./dto/inbound-events.dto.js";
import { InboundService } from "./inbound.service.js";

@ApiTags("Inbound events")
@ApiBearerAuth("bearer")
@Controller("inbound-events")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Get()
  @RequiresScope("events:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listInboundEvents",
    summary: "List inbound webhook events",
    description:
      "Webhook events received from inbound sources (e.g. Stripe) for this environment, most recent first, with the events they matched and what happened (workflow triggered, no workflow triggered by it, person not found, etc.).",
  })
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
