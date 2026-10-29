import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { createDrizzleClient } from "@subscriber.dev/db/client";

import type { User } from "../../common/interfaces/user.interface.js";
import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import { track } from "../../posthog.js";
import {
  BroadcastDetailResponseDto,
  BroadcastSummaryDto,
  ListBroadcastsQueryDto,
  ListBroadcastsResponseDto,
  PreviewBroadcastResponseDto,
  TriggerBroadcastDto,
  TriggerBroadcastResponseDto,
} from "./dto/broadcast.dto.js";
import {
  CreateWorkflowDto,
  WorkflowDetailResponseDto,
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
@Controller("workflows")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post("trigger")
  @RequiresScope("workflows:trigger")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "triggerWorkflow",
    summary: "Trigger a workflow",
    description:
      "Starts a run of the workflow identified by `key` for the matched subscriber, scheduling all of its steps.",
  })
  @ApiResponse({ status: 200, type: TriggerWorkflowResponseDto })
  @ApiResponse({
    status: 404,
    description: "Environment, workflow, or subscriber not found",
  })
  async triggerWorkflow(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: TriggerWorkflowDto,
  ): Promise<TriggerWorkflowResponseDto> {
    const db = createDrizzleClient();

    const result = await this.workflowService.triggerWorkflow(
      db,
      environment.id,
      {
        key: input.key,
        subscriber: input.subscriber,
        payload: input.payload,
        triggeredBy: user?.id ?? null,
      },
    );
    track(
      "workflow_triggered",
      { via: "api", userId: user?.id, workspaceId: environment.workspaceId },
      { triggered: result.triggered },
    );
    return result;
  }

  @Post()
  @RequiresScope("workflows:write")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "createWorkflow",
    summary: "Create a new workflow",
    description:
      "Creates a workflow definition: a named, ordered sequence of steps (email or webhook), each with a delay relative to the previous step. Optional `triggers` start it automatically on events from connected integrations, e.g. Stripe's trial_started, and `exitConditions` stop a person's active run on others.",
  })
  @ApiResponse({ status: 201, type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async createWorkflow(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: CreateWorkflowDto,
  ) {
    const db = createDrizzleClient();

    const workflow = await this.workflowService.createWorkflow(
      db,
      environment,
      {
        key: input.key,
        name: input.name,
        description: input.description,
        type: input.type,
        channels: input.channels,
        steps: input.steps,
        triggers: input.triggers,
        exitConditions: input.exitConditions,
        createdBy: user?.id ?? null,
      },
    );
    track(
      "workflow_created",
      { via: "api", userId: user?.id, workspaceId: environment.workspaceId },
      { workflow_type: input.type, step_count: input.steps.length },
    );
    return workflow;
  }

  @Get()
  @RequiresScope("workflows:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listWorkflows",
    summary: "List workflows",
    description: "Returns a paginated list of workflows in the environment",
  })
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
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Query() query: ListWorkflowsQueryDto,
  ): Promise<ListWorkflowsResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.listWorkflows(db, environment, {
      limit: query.limit,
      offset: query.offset,
      type: query.type,
    });
  }

  @Get("runs")
  @RequiresScope("workflows:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listEnvironmentRuns",
    summary: "List all workflow runs",
    description:
      "Returns a paginated list of trigger runs across every workflow in the environment, most recent first",
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListEnvironmentRunsResponseDto })
  @ApiResponse({ status: 404, description: "Environment not found" })
  async listEnvironmentRuns(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Query() query: ListRunsQueryDto,
  ): Promise<ListEnvironmentRunsResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.listRunsForEnvironment(db, environment.id, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(":workflowId")
  @RequiresScope("workflows:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getWorkflow",
    summary: "Get a workflow",
    description: "Returns a single workflow with its steps",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: WorkflowDetailResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async getWorkflow(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
  ): Promise<WorkflowDetailResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.getWorkflow(db, environment, workflowId);
  }

  @Patch(":workflowId")
  @RequiresScope("workflows:write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateWorkflow",
    summary: "Update a workflow",
    description:
      "Updates workflow fields. If `steps` is provided, it replaces ALL existing steps; likewise for `triggers` and `exitConditions`.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async updateWorkflow(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Body() input: UpdateWorkflowDto,
  ) {
    const db = createDrizzleClient();

    return this.workflowService.updateWorkflow(db, environment, workflowId, {
      key: input.key,
      name: input.name,
      description: input.description,
      status: input.status,
      channels: input.channels,
      steps: input.steps,
      triggers: input.triggers,
      exitConditions: input.exitConditions,
      updatedBy: user?.id ?? null,
    });
  }

  @Delete(":workflowId")
  @RequiresScope("workflows:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteWorkflow",
    summary: "Delete a workflow",
    description:
      "Soft-deletes a workflow. Existing in-flight runs are unaffected.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 204, description: "Workflow deleted" })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async deleteWorkflow(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
  ): Promise<void> {
    const db = createDrizzleClient();

    await this.workflowService.deleteWorkflow(
      db,
      environment.id,
      workflowId,
      user?.id ?? null,
    );
  }

  @Get(":workflowId/runs")
  @RequiresScope("workflows:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listWorkflowRuns",
    summary: "List runs for a workflow",
    description:
      "Returns a paginated list of trigger runs for this workflow, most recent first",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListRunsResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async listWorkflowRuns(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<ListRunsResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.listRuns(db, environment.id, workflowId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Post(":workflowId/broadcast/preview")
  @RequiresScope("broadcasts:read")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "previewBroadcast",
    summary: "Preview a broadcast's audience size",
    description:
      "Resolves the audience query and returns how many subscribers currently match, without creating or sending anything. Intended for confirming a broadcast's blast radius before triggering it.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: PreviewBroadcastResponseDto })
  @ApiResponse({
    status: 400,
    description: "Workflow is paused or has no steps",
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async previewBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Body() input: TriggerBroadcastDto,
  ): Promise<PreviewBroadcastResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.previewBroadcast(
      db,
      environment.id,
      workflowId,
      input.audience,
    );
  }

  @Post(":workflowId/broadcast")
  @RequiresScope("broadcasts:write")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "triggerBroadcast",
    summary: "Trigger a broadcast",
    description:
      "Fans this workflow out to every subscriber matching the audience query. Resolving the audience and scheduling sends happens asynchronously — poll the returned broadcast (via listBroadcasts/getBroadcast) for progress.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiResponse({ status: 200, type: TriggerBroadcastResponseDto })
  @ApiResponse({
    status: 400,
    description: "Workflow is paused or has no steps",
  })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async triggerBroadcast(
    @CurrentUser() user: User | null,
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Body() input: TriggerBroadcastDto,
  ): Promise<TriggerBroadcastResponseDto> {
    const db = createDrizzleClient();

    const broadcast = await this.workflowService.triggerBroadcast(
      db,
      environment.id,
      workflowId,
      input.audience,
      user?.id ?? null,
      {
        sendOverHours: input.sendOverHours,
        allowOverPlan: input.allowOverPlan,
      },
    );
    track("broadcast_triggered", {
      via: "api",
      userId: user?.id,
      workspaceId: environment.workspaceId,
    });
    return broadcast;
  }

  @Get(":workflowId/broadcasts")
  @RequiresScope("broadcasts:read")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "listBroadcasts",
    summary: "List broadcasts for a workflow",
    description:
      "Returns a paginated list of broadcasts triggered for this workflow, most recent first",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: ListBroadcastsResponseDto })
  @ApiResponse({ status: 404, description: "Workflow not found" })
  async listBroadcasts(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Query() query: ListBroadcastsQueryDto,
  ): Promise<ListBroadcastsResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.listBroadcasts(db, environment.id, workflowId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(":workflowId/broadcasts/:broadcastId")
  @RequiresScope("broadcasts:read")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "getBroadcast",
    summary: "Get a broadcast",
    description:
      "Returns a single broadcast with its resolved audience size and derived step-outcome counts (sent/failed/skipped/pending)",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastDetailResponseDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  async getBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastDetailResponseDto> {
    const db = createDrizzleClient();

    return this.workflowService.getBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }

  @Post(":workflowId/broadcasts/:broadcastId/pause")
  @RequiresScope("broadcasts:write")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "pauseBroadcast",
    summary: "Pause a broadcast",
    description:
      "Holds every send that hasn't gone out yet until the broadcast is resumed. Already-sent emails are unaffected.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastSummaryDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  @ApiResponse({
    status: 409,
    description: "Broadcast isn't pending or queued",
  })
  async pauseBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastSummaryDto> {
    const db = createDrizzleClient();

    return this.workflowService.pauseBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }

  @Post(":workflowId/broadcasts/:broadcastId/resume")
  @RequiresScope("broadcasts:write")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "resumeBroadcast",
    summary: "Resume a paused broadcast",
    description:
      "Lets a paused broadcast carry on sending. The remaining sends keep their original spacing, pushed back by however long it was paused.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastSummaryDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  @ApiResponse({
    status: 409,
    description: "Broadcast isn't paused",
  })
  async resumeBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastSummaryDto> {
    const db = createDrizzleClient();

    return this.workflowService.resumeBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }

  @Post(":workflowId/broadcasts/:broadcastId/cancel")
  @RequiresScope("broadcasts:write")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "cancelBroadcast",
    summary: "Cancel a broadcast",
    description:
      "Permanently stops a broadcast: every send that hasn't gone out yet is cancelled. Already-sent emails are unaffected. Cannot be undone.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastSummaryDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  @ApiResponse({
    status: 409,
    description: "Broadcast isn't pending, queued or paused",
  })
  async cancelBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastSummaryDto> {
    const db = createDrizzleClient();

    return this.workflowService.cancelBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }

  @Post(":workflowId/broadcasts/:broadcastId/redispatch")
  @RequiresScope("broadcasts:write")
  @ApiTags("Broadcasts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "redispatchBroadcast",
    summary: "Re-dispatch a broadcast",
    description:
      "Re-runs setup for every matching subscriber who hasn't been set up yet (for example after setup jobs failed), spread over a fresh send window. Subscribers already set up are skipped, so nobody receives the email twice.",
  })
  @ApiParam({ name: "workflowId", type: "string" })
  @ApiParam({ name: "broadcastId", type: "string" })
  @ApiResponse({ status: 200, type: BroadcastSummaryDto })
  @ApiResponse({ status: 404, description: "Workflow or broadcast not found" })
  @ApiResponse({
    status: 409,
    description: "Broadcast isn't queued",
  })
  async redispatchBroadcast(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Param("workflowId") workflowId: string,
    @Param("broadcastId") broadcastId: string,
  ): Promise<BroadcastSummaryDto> {
    const db = createDrizzleClient();

    return this.workflowService.redispatchBroadcast(
      db,
      environment.id,
      workflowId,
      broadcastId,
    );
  }
}
