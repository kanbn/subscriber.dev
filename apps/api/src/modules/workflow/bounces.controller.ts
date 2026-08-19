import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import { BounceWebhookBodyDto } from "./dto/bounce-webhook.dto.js";
import { WorkflowService } from "./workflow.service.js";

@ApiTags("Bounces")
@Controller("bounces")
export class BouncesController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post("inbound")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: "recordInboundBounce",
    summary: "Record an inbound bounce event",
    description:
      "Generic bounce-recording endpoint, identified by the run step's publicId - callers are expected to have that publicId available via whatever mechanism they use to learn about the bounce (e.g. a provider's native webhook echoing back metadata set at send time). Authenticated with a shared bearer secret (BOUNCE_WEBHOOK_SECRET), not an API key. Enqueues the bounce for async processing and returns immediately.",
  })
  @ApiResponse({ status: 202, description: "Bounce event enqueued" })
  @ApiResponse({ status: 401, description: "Invalid or missing shared secret" })
  @ApiResponse({ status: 404, description: "Run step not found" })
  async recordInboundBounce(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: BounceWebhookBodyDto,
  ): Promise<void> {
    const expected = process.env.BOUNCE_WEBHOOK_SECRET;
    if (!expected || authorization !== `Bearer ${expected}`) {
      throw new UnauthorizedException("Invalid bounce webhook secret");
    }

    const db = createDrizzleClient();

    await this.workflowService.recordBounceEvent(db, {
      runStepPublicId: body.runStepPublicId,
      bounceType: body.bounceType,
      reason: body.reason,
    });
  }
}
