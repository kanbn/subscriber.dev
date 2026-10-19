import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  IntegrationResponseDto,
  ListIntegrationsResponseDto,
  UpsertIntegrationDto,
} from "./dto/integration.dto.js";
import { IntegrationsService } from "./integrations.service.js";

@ApiTags("Integrations")
@ApiBearerAuth("bearer")
@Controller("integrations")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Patch(":type")
  @RequiresScope("integrations:write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "upsertIntegration",
    summary: "Configure an integration",
    description:
      'Creates or updates the integration of the given type for this environment (e.g. "smtp"). Body shape depends on the integration type; secret fields (e.g. password) are encrypted at rest and never returned. When updating, omit secret fields to keep the stored ones; config fields are always replaced in full.',
  })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Integration saved",
    type: IntegrationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid config or failed verification",
  })
  @ApiResponse({
    status: 404,
    description: "Environment or integration type not found",
  })
  async upsert(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("type") type: string,
    @Body() body: UpsertIntegrationDto,
  ): Promise<IntegrationResponseDto> {
    const db = createDrizzleClient();

    return this.integrationsService.upsert(
      db,
      environment.id,
      type,
      body,
      user?.id ?? null,
    );
  }

  @Patch(":type/primary")
  @RequiresScope("integrations:write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "setPrimaryIntegration",
    summary: "Set an integration as primary",
    description:
      "Moves this integration to the front of the environment's failover order (tried first on send). The rest keep their relative order as fallbacks.",
  })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Integration promoted to primary",
    type: IntegrationResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Environment or integration not found",
  })
  async setPrimary(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("type") type: string,
  ): Promise<IntegrationResponseDto> {
    const db = createDrizzleClient();

    return this.integrationsService.setPrimary(db, environment.id, type);
  }

  @Get()
  @RequiresScope("integrations:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listIntegrations",
    summary: "List configured integrations",
    description:
      "Returns every integration configured for this environment, sanitized (no secrets).",
  })
  @ApiResponse({ status: 200, type: ListIntegrationsResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async list(
    @CurrentEnvironment() environment: EnvironmentForUser,
  ): Promise<ListIntegrationsResponseDto> {
    const db = createDrizzleClient();

    return this.integrationsService.list(db, environment.id);
  }

  @Get(":type")
  @RequiresScope("integrations:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getIntegration",
    summary: "Get an integration",
    description:
      "Returns the sanitized config for a single integration type (no secrets).",
  })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({ status: 200, type: IntegrationResponseDto })
  @ApiResponse({
    status: 404,
    description: "Environment or integration not found",
  })
  async get(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("type") type: string,
  ): Promise<IntegrationResponseDto> {
    const db = createDrizzleClient();

    return this.integrationsService.get(db, environment.id, type);
  }

  @Delete(":type")
  @RequiresScope("integrations:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteIntegration",
    summary: "Remove an integration",
  })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({ status: 204, description: "Integration deleted" })
  @ApiResponse({
    status: 404,
    description: "Environment or integration not found",
  })
  async delete(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("type") type: string,
  ): Promise<void> {
    const db = createDrizzleClient();

    await this.integrationsService.delete(db, environment.id, type);
  }
}
