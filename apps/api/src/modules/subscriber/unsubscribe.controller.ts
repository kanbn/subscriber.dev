import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import {
  UnsubscribeQueryDto,
  UnsubscribeResponseDto,
} from "./dto/unsubscribe.dto.js";
import { SubscriberService } from "./subscriber.service.js";

@ApiTags("Unsubscribe")
@Controller()
export class UnsubscribeController {
  constructor(private readonly subscriberService: SubscriberService) {}

  @Get("unsubscribe")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "unsubscribe",
    summary: "Unsubscribe via email link",
    description:
      "Public endpoint for one-click unsubscribe links embedded in emails. Verifies the signed token and turns off email notifications for the subscriber it identifies. No API key required.",
  })
  @ApiQuery({ name: "token", required: true, type: String })
  @ApiResponse({ status: 200, type: UnsubscribeResponseDto })
  @ApiResponse({
    status: 404,
    description: "Invalid or expired unsubscribe link",
  })
  async unsubscribe(
    @Query() query: UnsubscribeQueryDto,
  ): Promise<UnsubscribeResponseDto> {
    const db = createDrizzleClient();

    return this.subscriberService.unsubscribeByToken(db, query.token);
  }
}
