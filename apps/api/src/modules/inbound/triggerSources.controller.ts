import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import { ListTriggerSourcesResponseDto } from "./dto/trigger-sources.dto.js";
import { InboundService } from "./inbound.service.js";

@ApiTags("Inbound events")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/trigger-sources")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class TriggerSourcesController {
  constructor(private readonly inboundService: InboundService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listTriggerSources",
    summary: "List workflow trigger sources",
    description:
      "Integrations whose events can trigger workflows (e.g. Stripe), whether each is connected in this environment, and the events each offers.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: ListTriggerSourcesResponseDto })
  async listTriggerSources(
    @CurrentEnvironment() environment: EnvironmentForUser,
  ): Promise<ListTriggerSourcesResponseDto> {
    return this.inboundService.listTriggerSources(
      createDrizzleClient(),
      environment.id,
    );
  }
}
