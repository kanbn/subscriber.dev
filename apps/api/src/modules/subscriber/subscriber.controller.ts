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
  Post,
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

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import {
  BulkUpsertSubscribersDto,
  BulkUpsertSubscribersResponseDto,
} from "./dto/bulk-upsert-subscribers.dto.js";
import {
  CreateSubscriberDto,
  CreateSubscriberResponseDto,
} from "./dto/create-subscriber.dto.js";
import { GetSubscriberResponseDto } from "./dto/get-subscriber.dto.js";
import {
  ListSubscribersQueryDto,
  ListSubscribersResponseDto,
} from "./dto/list-subscribers.dto.js";
import {
  UpdatePreferencesDto,
  UpdatePreferencesResponseDto,
} from "./dto/update-preferences.dto.js";
import {
  UpdateSubscriberDto,
  UpdateSubscriberResponseDto,
} from "./dto/update-subscriber.dto.js";
import { SubscriberService } from "./subscriber.service.js";

@ApiTags("Subscribers")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/subscribers")
@UseGuards(AuthGuard)
export class SubscriberController {
  constructor(private readonly subscriberService: SubscriberService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listSubscribers",
    summary: "List subscribers",
    description:
      "Returns a paginated list of active subscribers in the environment",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({
    name: "email",
    required: false,
    type: String,
    description: "Filter to the subscriber with this exact email address",
  })
  @ApiQuery({
    name: "externalId",
    required: false,
    type: String,
    description: "Filter to the subscriber with this exact external ID",
  })
  @ApiQuery({
    name: "emailOptedIn",
    required: false,
    type: Boolean,
    description:
      "Filter by the subscriber's latest email preference (true = opted in, false = opted out)",
  })
  @ApiResponse({ status: 200, type: ListSubscribersResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async listSubscribers(
    @Param("environmentId") environmentId: string,
    @Query() query: ListSubscribersQueryDto,
  ): Promise<ListSubscribersResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.subscriberService.listSubscribers(db, environment.id, {
      limit: query.limit,
      offset: query.offset,
      email: query.email,
      externalId: query.externalId,
      emailOptedIn: query.emailOptedIn,
    });
  }

  @Get(":subscriberId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getSubscriber",
    summary: "Get a subscriber",
    description: "Returns a single subscriber with their latest preferences",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "subscriberId", type: "string" })
  @ApiResponse({ status: 200, type: GetSubscriberResponseDto })
  @ApiResponse({ status: 404, description: "Subscriber not found" })
  async getSubscriber(
    @Param("environmentId") environmentId: string,
    @Param("subscriberId") subscriberId: string,
  ): Promise<GetSubscriberResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.subscriberService.getSubscriber(
      db,
      environment.id,
      subscriberId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createSubscriber",
    summary: "Create a new subscriber",
    description:
      "Creates a new subscriber in the specified environment and initialises their preferences",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({
    status: 201,
    type: CreateSubscriberResponseDto,
    description: "Subscriber created successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Bad request - validation error or duplicate subscriber",
  })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async createSubscriber(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Body() input: CreateSubscriberDto,
  ): Promise<CreateSubscriberResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.subscriberService.createSubscriber(db, {
      environmentId: environment.id,
      publicId: input.publicId,
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

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "bulkUpsertSubscribers",
    summary: "Bulk create or update subscribers",
    description:
      "Upserts up to 500 subscribers per request. Each row is matched to an existing subscriber by publicId, then externalId, then email (in that order); if none match, a new subscriber is created. Rows are processed independently, so one failing row does not fail the batch.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: BulkUpsertSubscribersResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async bulkUpsertSubscribers(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Body() input: BulkUpsertSubscribersDto,
  ): Promise<BulkUpsertSubscribersResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.subscriberService.bulkUpsertSubscribers(
      db,
      environment.id,
      input.subscribers,
      user.id,
    );
  }

  @Patch(":subscriberId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateSubscriber",
    summary: "Update a subscriber",
    description: "Updates subscriber fields. All fields are optional.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "subscriberId", type: "string" })
  @ApiResponse({ status: 200, type: UpdateSubscriberResponseDto })
  @ApiResponse({ status: 404, description: "Subscriber not found" })
  async updateSubscriber(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("subscriberId") subscriberId: string,
    @Body() input: UpdateSubscriberDto,
  ): Promise<UpdateSubscriberResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environment.id,
      subscriberId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return this.subscriberService.updateSubscriber(db, {
      subscriberId: subscriber.id,
      email: input.email,
      phone: input.phone,
      externalId: input.externalId,
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      attributes: input.attributes,
      updatedBy: user.id,
    });
  }

  @Delete(":subscriberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteSubscriber",
    summary: "Delete a subscriber",
    description:
      "Soft-deletes a subscriber. The record is retained but excluded from all queries.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "subscriberId", type: "string" })
  @ApiResponse({ status: 204, description: "Subscriber deleted" })
  @ApiResponse({ status: 404, description: "Subscriber not found" })
  async deleteSubscriber(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("subscriberId") subscriberId: string,
  ): Promise<void> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    await this.subscriberService.deleteSubscriber(
      db,
      environment.id,
      subscriberId,
      user.id,
    );
  }

  @Patch(":subscriberId/preferences")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateSubscriberPreferences",
    summary: "Update subscriber preferences",
    description:
      "Creates a new preference record with updated values (immutable pattern)",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "subscriberId", type: "string" })
  @ApiResponse({
    status: 200,
    type: UpdatePreferencesResponseDto,
    description: "Preferences updated successfully",
  })
  @ApiResponse({
    status: 404,
    description: "Subscriber or preferences not found",
  })
  async updatePreferences(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("subscriberId") subscriberId: string,
    @Body() input: UpdatePreferencesDto,
  ): Promise<UpdatePreferencesResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environment.id,
      subscriberId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return this.subscriberService.updatePreferences(db, {
      subscriberId: subscriber.id,
      email: input.email,
    });
  }
}
