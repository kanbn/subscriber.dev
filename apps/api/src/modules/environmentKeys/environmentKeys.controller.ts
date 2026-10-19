import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentKeyForRequest } from "@subscriber.dev/db/repository/environmentKey.repo";
import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import {
  ANY_SCOPE,
  CurrentEnvironmentKey,
  RequiresScope,
} from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  CreatedEnvironmentKeyDto,
  CreateEnvironmentKeyDto,
  CurrentEnvironmentKeyDto,
  ListEnvironmentKeysResponseDto,
} from "./dto/environmentKey.dto.js";
import { EnvironmentKeysService } from "./environmentKeys.service.js";

@ApiTags("API keys")
@ApiBearerAuth("bearer")
@Controller("keys")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class EnvironmentKeysController {
  constructor(
    private readonly environmentKeysService: EnvironmentKeysService,
  ) {}

  @Post()
  @ApiOperation({
    operationId: "createEnvironmentKey",
    summary: "Create an API key",
    description:
      "Creates an API key for this environment. The key is only returned once. Signed-in users only: an API key can't create keys.",
  })
  @ApiResponse({ status: 201, type: CreatedEnvironmentKeyDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async create(
    @CurrentUser() user: User,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: CreateEnvironmentKeyDto,
  ): Promise<CreatedEnvironmentKeyDto> {
    return this.environmentKeysService.create(
      createDrizzleClient(),
      environment.id,
      input,
      user.id,
    );
  }

  @Get()
  @ApiOperation({
    operationId: "listEnvironmentKeys",
    summary: "List API keys",
  })
  @ApiResponse({ status: 200, type: ListEnvironmentKeysResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async list(
    @CurrentEnvironment() environment: EnvironmentForUser,
  ): Promise<ListEnvironmentKeysResponseDto> {
    return this.environmentKeysService.list(
      createDrizzleClient(),
      environment.id,
    );
  }

  @Delete(":keyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "revokeEnvironmentKey",
    summary: "Revoke an API key",
    description: "Requests made with the key fail straight away.",
  })
  @ApiParam({ name: "keyId", type: "string" })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: "Environment or API key not found" })
  async revoke(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("keyId") keyId: string,
  ): Promise<void> {
    await this.environmentKeysService.revoke(
      createDrizzleClient(),
      environment.id,
      keyId,
    );
  }
}

@ApiTags("API keys")
@Controller("keys")
@UseGuards(AuthGuard)
export class CurrentEnvironmentKeyController {
  constructor(
    private readonly environmentKeysService: EnvironmentKeysService,
  ) {}

  @Get("me")
  @RequiresScope(ANY_SCOPE)
  @ApiOperation({
    operationId: "getCurrentEnvironmentKey",
    summary: "Get the API key this request was made with",
    description:
      "Any API key can call this, whatever its scopes. Use it to find the key's environment ID.",
  })
  @ApiResponse({ status: 200, type: CurrentEnvironmentKeyDto })
  @ApiResponse({ status: 400, description: "Not called with an API key" })
  current(
    @CurrentEnvironmentKey() key: EnvironmentKeyForRequest | null,
  ): CurrentEnvironmentKeyDto {
    if (!key) throw new BadRequestException("Not called with an API key");
    return this.environmentKeysService.current(key);
  }
}
