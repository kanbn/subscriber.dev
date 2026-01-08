import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
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

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import {
  CreateSubscriberDto,
  CreateSubscriberResponseDto,
} from "./dto/create-subscriber.dto.js";
import { SubscriberService } from "./subscriber.service.js";

@ApiTags("Subscribers")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/subscribers")
@UseGuards(AuthGuard)
export class SubscriberController {
  constructor(private readonly subscriberService: SubscriberService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createSubscriber",
    summary: "Create a new subscriber",
    description:
      "Creates a new subscriber in the specified environment and initialises their preferences",
  })
  @ApiParam({
    name: "environmentId",
    description: "The ID of the environment",
    type: "string",
  })
  @ApiResponse({
    status: 201,
    type: CreateSubscriberResponseDto,
    description: "Subscriber created successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Bad request - validation error or duplicate subscriber",
  })
  @ApiResponse({
    status: 404,
    description: "Environment not found",
  })
  async createSubscriber(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Body() input: CreateSubscriberDto,
  ): Promise<CreateSubscriberResponseDto> {
    const db = createDrizzleClient();

    // Verify environment exists (@todo: check user has access)
    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );

    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.subscriberService.createSubscriber(db, {
      environmentId: environment.id,
      email: input.email,
      phone: input.phone,
      externalId: input.externalId,
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      attributes: input.attributes ?? null,
      emailPreference: input.preferences?.email ?? true,
      createdBy: user.id,
    });
  }
}
