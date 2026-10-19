import type { Request } from "express";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import {
  getAuth,
  headersFromRaw,
} from "../../common/guards/session.util.js";
import {
  AgentResponseDto,
  UpdateUserDto,
  UpdateUserResponseDto,
  UserResponseDto,
} from "./dto/user.dto.js";
import { UserService } from "./user.service.js";

@ApiTags("Users")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("users")
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  @ApiOperation({ operationId: "getCurrentUser", summary: "Get current user" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getUser(
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const db = createDrizzleClient();
    return this.userService.getUser(db, user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateCurrentUser",
    summary: "Update current user",
  })
  @ApiResponse({ status: 200, type: UpdateUserResponseDto })
  async updateUser(
    @CurrentUser() user: User,
    @Body() input: UpdateUserDto,
    @Req() req: Request,
  ): Promise<UpdateUserResponseDto> {
    const db = createDrizzleClient();
    return this.userService.updateUser(db, user.publicId, input);
  }

  @Get("me/agents")
  @ApiOperation({
    operationId: "listAgents",
    summary: "List AI agents connected through MCP sign-in",
  })
  @ApiResponse({ status: 200, type: [AgentResponseDto] })
  async listAgents(@CurrentUser() user: User): Promise<AgentResponseDto[]> {
    const db = createDrizzleClient();
    return this.userService.listAgents(db, user.id);
  }

  @Delete("me/agents/:clientId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "disconnectAgent",
    summary: "Disconnect an AI agent and revoke its access",
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: "Agent not found" })
  async disconnectAgent(
    @CurrentUser() user: User,
    @Param("clientId") clientId: string,
  ): Promise<void> {
    const db = createDrizzleClient();
    await this.userService.disconnectAgent(db, user.id, clientId);
  }

  @Delete("me/session")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "signOut",
    summary: "Sign out the session this request was made with",
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: "Not signed in" })
  async signOut(@Req() req: Request): Promise<void> {
    const { auth } = getAuth();
    await auth.api.signOut({ headers: headersFromRaw(req.headers) });
  }
}
