import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  EmailContentDto,
  RenderedEmailDto,
  TestEmailDto,
  TestEmailResponseDto,
} from "./dto/email.dto.js";
import { EmailTestService } from "./emailTest.service.js";

@ApiTags("Workflows")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/emails")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class EmailController {
  constructor(private readonly emailTest: EmailTestService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "previewEmail",
    summary: "Render an email",
    description:
      "Renders a subject and body the way they'd send, filling in variables with your own details as the sample subscriber. Nothing is sent.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: RenderedEmailDto })
  async preview(
    @CurrentUser() user: User,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: EmailContentDto,
  ): Promise<RenderedEmailDto> {
    return this.emailTest.preview(
      createDrizzleClient(),
      user,
      environment.id,
      input,
    );
  }

  @Post("test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "sendTestEmail",
    summary: "Send a test email",
    description:
      "Sends a subject and body through the environment's email integration, to you or another address, without creating a subscriber or a run. Your details are the sample subscriber unless you pass data. Subject lines are prefixed with [Test], and test emails don't count towards analytics or usage.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: TestEmailResponseDto })
  @ApiResponse({
    status: 400,
    description: "No email integration, or the email couldn't be sent",
  })
  async sendTest(
    @CurrentUser() user: User,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: TestEmailDto,
  ): Promise<TestEmailResponseDto> {
    const { to, data, ...content } = input;
    return this.emailTest.send(
      createDrizzleClient(),
      user,
      environment.id,
      content,
      { to, data },
    );
  }
}
