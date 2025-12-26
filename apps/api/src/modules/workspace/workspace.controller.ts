import {
  Body,
  Controller,
  Get,
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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { UserService } from "../user/user.service.js";
import {
  CreateWorkspaceDto,
  CreateWorkspaceResponseDto,
} from "./dto/create-workspace.dto.js";
import { GetWorkspaceResponseDto } from "./dto/get-workspace.dto.js";
import { WorkspaceService } from "./workspace.service.js";

@ApiTags("Workspaces")
@ApiBearerAuth("bearer")
@Controller("workspaces")
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly userService: UserService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: "getWorkspaces",
    summary: "Get user's workspaces",
  })
  @ApiResponse({ status: 200, type: [GetWorkspaceResponseDto] })
  async getWorkspaces(
    @CurrentUser() user: User,
  ): Promise<GetWorkspaceResponseDto[]> {
    console.log("user", user);
    const db = createDrizzleClient();
    return this.workspaceService.getWorkspacesByUserId(db, user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createWorkspace",
    summary: "Create a new workspace",
  })
  @ApiResponse({ status: 201, type: CreateWorkspaceResponseDto })
  async createWorkspace(
    @CurrentUser() user: User,
    @Body() input: CreateWorkspaceDto,
  ): Promise<CreateWorkspaceResponseDto> {
    const db = createDrizzleClient();
    const userRecord = await this.userService.getUser(db, user.id);

    return this.workspaceService.createWorkspace(db, user.id, {
      name: input.name,
    });
  }
}
