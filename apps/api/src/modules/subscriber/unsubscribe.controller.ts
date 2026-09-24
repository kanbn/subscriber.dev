import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Redirect,
} from "@nestjs/common";
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import {
  UnsubscribeBodyDto,
  UnsubscribeResponseDto,
} from "./dto/unsubscribe.dto.js";
import { SubscriberService } from "./subscriber.service.js";

@ApiTags("Unsubscribe")
@Controller()
export class UnsubscribeController {
  constructor(private readonly subscriberService: SubscriberService) {}

  @Post("unsubscribe")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "unsubscribe",
    summary: "Unsubscribe",
    description:
      "Called from the unsubscribe confirmation page linked from emails. Verifies the signed token and turns off email notifications for the subscriber it identifies. No API key required.",
  })
  @ApiResponse({ status: 200, type: UnsubscribeResponseDto })
  @ApiResponse({
    status: 404,
    description: "Invalid or expired unsubscribe link",
  })
  async unsubscribe(
    @Body() body: UnsubscribeBodyDto,
  ): Promise<UnsubscribeResponseDto> {
    const db = createDrizzleClient();

    return this.subscriberService.unsubscribeByToken(db, body.token);
  }

  @Post("unsubscribe/one-click")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async oneClickUnsubscribe(
    @Query("token") token: string | undefined,
  ): Promise<UnsubscribeResponseDto> {
    if (!token) {
      throw new NotFoundException("Invalid or expired unsubscribe link");
    }
    const db = createDrizzleClient();

    return this.subscriberService.unsubscribeByToken(db, token);
  }

  @Get("unsubscribe/one-click")
  @Redirect()
  @ApiExcludeEndpoint()
  oneClickUnsubscribePage(@Query("token") token: string | undefined) {
    const params = token ? `?token=${encodeURIComponent(token)}` : "";
    return {
      url: `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/unsubscribe${params}`,
      statusCode: HttpStatus.FOUND,
    };
  }
}
