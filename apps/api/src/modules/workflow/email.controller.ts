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
  EmailContentDto,
  RenderedEmailDto,
  TestEmailDto,
  TestEmailResponseDto,
} from "./dto/email.dto.js";
import { EmailTestService } from "./emailTest.service.js";

@ApiTags("Emails")
@ApiBearerAuth("bearer")
@Controller("emails")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class EmailController {
  constructor(private readonly emailTest: EmailTestService) {}

  @Post("preview")
  @RequiresScope("emails:test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "previewEmail",
    summary: "Render an email",
    description:
      "Renders a subject and body the way they'd send, filling in variables with your own details as the sample subscriber. Nothing is sent.",
  })
  @ApiResponse({ status: 200, type: RenderedEmailDto })
  async preview(
    @CurrentUser() user: User | null,
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
  @RequiresScope("emails:test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "sendTestEmail",
    summary: "Send a test email",
    description:
      "Sends one of a workflow's email steps (workflowId, and optionally step), or a subject and body, through the environment's email integration, to you or another address, without creating a subscriber or a run. Your details are the sample subscriber unless you pass data. Subject lines are prefixed with [Test], and test emails don't count towards analytics or usage.",
  })
  @ApiResponse({ status: 200, type: TestEmailResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "No such email step, no email integration, or the email couldn't be sent",
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async sendTest(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: TestEmailDto,
  ): Promise<TestEmailResponseDto> {
    const { to, data, ...rest } = input;
    const db = createDrizzleClient();
    const content = await this.emailTest.content(db, environment.id, rest);
    return this.emailTest.send(db, user, environment.id, content, { to, data });
  }
}
