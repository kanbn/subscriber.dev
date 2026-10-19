import { Controller, Get, UseGuards } from "@nestjs/common";
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
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import { SetupResponseDto } from "./dto/setup.dto.js";
import { SetupService } from "./setup.service.js";

@ApiTags("Environments")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/setup")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get()
  @RequiresScope("analytics:read")
  @ApiOperation({
    operationId: "getSetup",
    summary: "Get the environment's setup checklist",
    description:
      "What's left to go from a new environment to the first email sent: connect an email provider, create a workflow, then trigger it.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: SetupResponseDto })
  async getSetup(
    @CurrentEnvironment() environment: EnvironmentForUser,
  ): Promise<SetupResponseDto> {
    return this.setupService.getSetup(createDrizzleClient(), environment.id);
  }
}
