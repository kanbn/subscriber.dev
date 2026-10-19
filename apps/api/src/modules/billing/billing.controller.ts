import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentKeyForRequest } from "@subscriber.dev/db/repository/environmentKey.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import {
  CurrentEnvironmentKey,
  RequiresScope,
} from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { BillingService } from "./billing.service.js";
import {
  BillingLinkResponseDto,
  BillingResponseDto,
  CreateCheckoutDto,
} from "./dto/billing.dto.js";

@ApiTags("Billing")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("workspaces/:workspaceId/billing")
@UseGuards(AuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: number, workspaceId: string) {
    const db = createDrizzleClient();
    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      userId,
      workspaceId,
    );
    if (!workspace) throw new NotFoundException("Workspace not found");
    return { db, workspace };
  }

  @Get()
  @RequiresScope("billing:read")
  @ApiOperation({
    operationId: "getBilling",
    summary: "Get a workspace's plan and usage",
  })
  @ApiParam({ name: "workspaceId", type: "string" })
  @ApiResponse({ status: 200, type: BillingResponseDto })
  async getBilling(
    @CurrentUser() user: User | null,
    @CurrentEnvironmentKey() key: EnvironmentKeyForRequest | null,
    @Param("workspaceId") workspaceId: string,
  ): Promise<BillingResponseDto> {
    if (key) {
      if (key.workspacePublicId !== workspaceId)
        throw new NotFoundException("Workspace not found");
      return this.billingService.getBilling(
        createDrizzleClient(),
        key.environment.workspaceId,
      );
    }
    if (!user) throw new UnauthorizedException("User not authenticated");
    const { db, workspace } = await this.workspace(user.id, workspaceId);
    return this.billingService.getBilling(db, workspace.id);
  }

  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "createCheckoutLink",
    summary:
      "Get a link to start a paid plan (or the billing portal if the workspace already has one)",
  })
  @ApiParam({ name: "workspaceId", type: "string" })
  @ApiResponse({ status: 200, type: BillingLinkResponseDto })
  async createCheckoutLink(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Body() input: CreateCheckoutDto,
  ): Promise<BillingLinkResponseDto> {
    const { db, workspace } = await this.workspace(user.id, workspaceId);
    return this.billingService.createCheckoutLink(
      db,
      workspace,
      user,
      input.plan,
      input.interval,
    );
  }

  @Post("portal")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "createBillingPortalLink",
    summary: "Get a link to manage or cancel the workspace's plan",
  })
  @ApiParam({ name: "workspaceId", type: "string" })
  @ApiResponse({ status: 200, type: BillingLinkResponseDto })
  async createPortalLink(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
  ): Promise<BillingLinkResponseDto> {
    const { db, workspace } = await this.workspace(user.id, workspaceId);
    return this.billingService.createPortalLink(db, workspace.id);
  }
}

@Controller("billing")
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ) {
    if (!request.rawBody || !signature)
      throw new BadRequestException("Missing body or signature");
    return this.billingService.handleWebhook(
      createDrizzleClient(),
      request.rawBody,
      signature,
    );
  }
}
