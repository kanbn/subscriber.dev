import {
  BadRequestException,
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
import { BillingService } from "../billing/billing.service.js";
import {
  EmailContentDto,
  RenderedEmailDto,
  TestEmailResponseDto,
} from "./dto/email.dto.js";
import {
  NoEmailIntegrationError,
  renderEmail,
  sendWithIntegrations,
} from "./sendEmailStep.js";

function sampleContext(user: User) {
  const name: string | null = user.name;
  const [firstName, ...rest] = (name ?? "").trim().split(/\s+/);
  return {
    subscriber: {
      email: user.email,
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      name: name ?? null,
    },
  };
}

@ApiTags("Workflows")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/emails")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class EmailController {
  constructor(private readonly billing: BillingService) {}

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
    const poweredBy = await this.billing.showsPoweredBy(
      createDrizzleClient(),
      environment.id,
    );
    const { subject, html } = await renderEmail(
      input,
      sampleContext(user),
      "#",
      poweredBy,
    ).catch((error: unknown) => {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Couldn't render the email",
      );
    });
    return { subject, html };
  }

  @Post("test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "sendTestEmail",
    summary: "Send a test email to yourself",
    description:
      "Sends a subject and body to your own email address through the environment's email integration, with your details as the sample subscriber. Subject lines are prefixed with [Test].",
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
    @Body() input: EmailContentDto,
  ): Promise<TestEmailResponseDto> {
    const db = createDrizzleClient();
    try {
      const email = await renderEmail(
        input,
        sampleContext(user),
        "#",
        await this.billing.showsPoweredBy(db, environment.id),
      );
      await sendWithIntegrations(db, environment.id, {
        to: user.email,
        ...email,
        subject: `[Test] ${email.subject}`,
        fromName: input.fromName,
        replyTo: input.replyTo,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof NoEmailIntegrationError
          ? "Connect an email integration to this environment first"
          : error instanceof Error
            ? error.message
            : "Couldn't send the test email",
      );
    }
    return { to: user.email };
  }
}
