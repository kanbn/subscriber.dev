import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import {
  BroadcastDetailResponseDto,
  ListBroadcastsQueryDto,
  ListBroadcastsResponseDto,
  PreviewBroadcastResponseDto,
  TriggerBroadcastDto,
  TriggerBroadcastResponseDto,
} from "./dto/broadcast.dto.js";
import {
  CreateWorkflowDto,
  WorkflowResponseDto,
} from "./dto/create-workflow.dto.js";
import {
  ListEnvironmentRunsResponseDto,
  ListRunsQueryDto,
  ListRunsResponseDto,
} from "./dto/list-runs.dto.js";
import {
  ListWorkflowsQueryDto,
  ListWorkflowsResponseDto,
} from "./dto/list-workflows.dto.js";
import {
  TriggerWorkflowDto,
  TriggerWorkflowResponseDto,
} from "./dto/trigger-workflow.dto.js";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto.js";
import { WorkflowService } from "./workflow.service.js";

@ApiTags("Workflows")
@ApiBearerAuth("bearer")
@Controller("environments/:environmentId/workflows")
@UseGuards(AuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post("trigger")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "triggerWorkflow",
    summary: "Trigger a workflow",
    description:
      "Starts a run of the workflow identified by `key` for the matched subscriber, scheduling all of its steps.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 200, type: TriggerWorkflowResponseDto })
  @ApiResponse({
    status: 404,
    description: "Environment, workflow, or subscriber not found",
  })
  async triggerWorkflow(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Body() input: TriggerWorkflowDto,
  ): Promise<TriggerWorkflowResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.triggerWorkflow(db, environment.id, {
      key: input.key,
      subscriber: input.subscriber,
      payload: input.payload,
      triggeredBy: user.id,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createWorkflow",
    summary: "Create a new workflow",
    description:
      "Creates a workflow definition: a named, ordered sequence of steps (email or webhook), each with a delay relative to the previous step.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 201, type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async createWorkflow(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Body() input: CreateWorkflowDto,
  ) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.createWorkflow(db, environment.id, {
      key: input.key,
      name: input.name,
      description: input.description,
      type: input.type,
      steps: input.steps,
      createdBy: user.id,
    });
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listWorkflows",
    summary: "List workflows",
    description: "Returns a paginated list of workflows in the environment",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["automation", "broadcast"],
  })
  @ApiResponse({ status: 200, type: ListWorkflowsResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async listWorkflows(
    @Param("environmentId") environmentId: string,
    @Query() query: ListWorkflowsQueryDto,
  ): Promise<ListWorkflowsResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.listWorkflows(db, environment.id, {
      limit: query.limit,
      offset: query.offset,
      type: query.type,
    });
  }

  @Get("runs")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listEnvironmentRuns",
    summary: "List all workflow runs",
    description:
      "Returns a paginated list of trigger runs across every workflow in the environment, most recent first",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListEnvironmentRunsResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async listEnvironmentRuns(
    @Param("environmentId") environmentId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<ListEnvironmentRunsResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.listRunsForEnvironment(db, environment.id, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(":workflowId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getWorkflow",
    summary: "Get a workflow",
    description: "Returns a single workflow with its steps",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async getWorkflow(
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
  ) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.getWorkflow(db, environment.id, workflowId);
  }

  @Patch(":workflowId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateWorkflow",
    summary: "Update a workflow",
    description:
      "Updates workflow fields. If `steps` is provided, it replaces ALL existing steps.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async updateWorkflow(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Body() input: UpdateWorkflowDto,
  ) {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.updateWorkflow(db, environment.id, workflowId, {
      key: input.key,
      name: input.name,
      description: input.description,
      status: input.status,
      steps: input.steps,
      updatedBy: user.id,
    });
  }

  @Delete(":workflowId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteWorkflow",
    summary: "Delete a workflow",
    description:
      "Soft-deletes a workflow. Existing in-flight runs are unaffected.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 204, description: "Workflow deleted" })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async deleteWorkflow(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
  ): Promise<void> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    await this.workflowService.deleteWorkflow(
      db,
      environment.id,
      workflowId,
      user.id,
    );
  }

  @Get(":workflowId/runs")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listWorkflowRuns",
    summary: "List runs for a workflow",
    description:
      "Returns a paginated list of trigger runs for this workflow, most recent first",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListRunsResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async listWorkflowRuns(
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<ListRunsResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.listRuns(db, environment.id, workflowId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Post(":workflowId/broadcast/preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "previewBroadcast",
    summary: "Preview a broadcast's audience size",
    description:
      "Resolves the audience query and returns how many subscribers currently match, without creating or sending anything. Intended for confirming a broadcast's blast radius before triggering it.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: PreviewBroadcastResponseDto })
  @ApiResponse({
    status: 400,
    description: "Workflow is paused or has no steps",
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async previewBroadcast(
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Body() input: TriggerBroadcastDto,
  ): Promise<PreviewBroadcastResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.previewBroadcast(
      db,
      environment.id,
      workflowId,
      input.audience,
    );
  }

  @Post(":workflowId/broadcast")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "triggerBroadcast",
    summary: "Trigger a broadcast",
    description:
      "Fans this workflow out to every subscriber matching the audience query. Resolving the audience and scheduling sends happens asynchronously — poll the returned broadcast (via listBroadcasts/getBroadcast) for progress.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: TriggerBroadcastResponseDto })
  @ApiResponse({
    status: 400,
    description: "Workflow is paused or has no steps",
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async triggerBroadcast(
    @CurrentUser() user: User,
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Body() input: TriggerBroadcastDto,
  ): Promise<TriggerBroadcastResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.triggerBroadcast(
      db,
      environment.id,
      workflowId,
      input.audience,
      user.id,
    );
  }

  @Get(":workflowId/broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listBroadcasts",
    summary: "List broadcasts for a workflow",
    description:
      "Returns a paginated list of broadcasts triggered for this workflow, most recent first",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListBroadcastsResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async listBroadcasts(
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Query() query: ListBroadcastsQueryDto,
  ): Promise<ListBroadcastsResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.listBroadcasts(db, environment.id, workflowId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(":workflowId/broadcasts/:broadcastId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getBroadcast",
    summary: "Get a broadcast",
    description:
      "Returns a single broadcast with its resolved audience size and derived step-outcome counts (sent/failed/skipped/pending)",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastDetailResponseDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  async getBroadcast(
    @Param("environmentId") environmentId: string,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastDetailResponseDto> {
    const db = createDrizzleClient();

    const environment = await subscriberRepo.getEnvironmentByPublicId(
      db,
      environmentId,
    );
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    return this.workflowService.getBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }
}
