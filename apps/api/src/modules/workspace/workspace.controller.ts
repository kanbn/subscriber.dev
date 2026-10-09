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
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { UserService } from "../user/user.service.js";
import { CreateEnvironmentDto } from "./dto/create-environment.dto.js";
import {
  CreateWorkspaceDto,
  CreateWorkspaceResponseDto,
} from "./dto/create-workspace.dto.js";
import {
  EnvironmentDto,
  ListEnvironmentsResponseDto,
  WorkspaceDto,
} from "./dto/get-workspace.dto.js";
import { WorkspaceService } from "./workspace.service.js";

@ApiTags("Workspaces")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
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
  @ApiResponse({ status: 200, type: [WorkspaceDto] })
  async getWorkspaces(@CurrentUser() user: User): Promise<WorkspaceDto[]> {
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

  @Get(":workspaceId/environments")
  @ApiOperation({
    operationId: "listEnvironments",
    summary: "List a workspace's environments",
  })
  @ApiParam({ name: "workspaceId", type: "string" })
  @ApiResponse({ status: 200, type: ListEnvironmentsResponseDto })
  @ApiResponse({ status: 404, description: "Workspace not found" })
  async listEnvironments(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ListEnvironmentsResponseDto> {
    const db = createDrizzleClient();
    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const environments =
      await this.workspaceService.listEnvironmentsForWorkspace(
        db,
        workspace.id,
      );

    return { environments };
  }

  @Post(":workspaceId/environments")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createEnvironment",
    summary: "Create a new environment in a workspace",
  })
  @ApiParam({ name: "workspaceId", type: "string" })
  @ApiResponse({ status: 201, type: EnvironmentDto })
  @ApiResponse({ status: 404, description: "Workspace not found" })
  async createEnvironment(
    @CurrentUser() user: User,
    @Param("workspaceId") workspaceId: string,
    @Body() input: CreateEnvironmentDto,
  ): Promise<EnvironmentDto> {
    const db = createDrizzleClient();
    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return this.workspaceService.createEnvironment(db, workspace.id, user.id, {
      name: input.name,
    });
  }
}
