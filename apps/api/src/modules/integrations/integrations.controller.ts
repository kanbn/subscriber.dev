import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { IntegrationsService } from "./integrations.service.js";

@ApiTags("Integrations")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/integrations")
@UseGuards(AuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Patch(":type")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "upsertIntegration",
    summary: "Configure an integration",
    description:
      'Creates or updates the integration of the given type for this environment (e.g. "smtp"). Body shape depends on the integration type; secret fields (e.g. password) are encrypted at rest and never returned.',
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({ status: 200, description: "Integration saved" })
  @ApiResponse({
    status: 400,
    description: "Invalid config or failed verification",
  })
  @ApiResponse({
    status: 404,
    description: "Environment or integration type not found",
  })
  async upsert(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("type") type: string,
    @Body() body: Record<string, unknown>,
  ) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.integrationsService.upsert(
      db,
      environment.id,
      type,
      body,
      user.id,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listIntegrations",
    summary: "List configured integrations",
    description:
      "Returns every integration configured for this environment, sanitized (no secrets).",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  async list(@Param("environmentId") environmentId: string) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.integrationsService.list(db, environment.id);
  }

  @Get(":type")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getIntegration",
    summary: "Get an integration",
    description:
      "Returns the sanitized config for a single integration type (no secrets).",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({
    status: 404,
    description: "Environment or integration not found",
  })
  async get(
    @Param("environmentId") environmentId: string,
    @Param("type") type: string,
  ) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.integrationsService.get(db, environment.id, type);
  }

  @Delete(":type")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteIntegration",
    summary: "Remove an integration",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "type", type: "string" })
  @ApiResponse({ status: 204, description: "Integration deleted" })
  @ApiResponse({
    status: 404,
    description: "Environment or integration not found",
  })
  async delete(
    @Param("environmentId") environmentId: string,
    @Param("type") type: string,
  ): Promise<void> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    await this.integrationsService.delete(db, environment.id, type);
  }
}
