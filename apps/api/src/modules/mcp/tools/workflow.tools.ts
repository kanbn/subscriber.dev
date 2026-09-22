import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import {
  ListBroadcastsQuerySchema,
  TriggerBroadcastSchema,
} from "../../workflow/dto/broadcast.dto.js";
import { CreateWorkflowSchema } from "../../workflow/dto/create-workflow.dto.js";
import { ListRunsQuerySchema } from "../../workflow/dto/list-runs.dto.js";
import { ListWorkflowsQuerySchema } from "../../workflow/dto/list-workflows.dto.js";
import { TriggerWorkflowSchema } from "../../workflow/dto/trigger-workflow.dto.js";
import { UpdateWorkflowSchema } from "../../workflow/dto/update-workflow.dto.js";
import { WorkflowService } from "../../workflow/workflow.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class WorkflowTools {
  constructor(private readonly workflowService: WorkflowService) {}

  @Tool({
    name: "trigger_workflow",
    description:
      "Start a run of the workflow identified by `key` for the matched subscriber, scheduling all of its steps. Sends real email/webhooks.",
    parameters: TriggerWorkflowSchema.extend({
      environmentId: z.string(),
    }),
    annotations: { destructiveHint: true, openWorldHint: true },
  })
  async triggerWorkflow(
    args: z.infer<typeof TriggerWorkflowSchema> & { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.triggerWorkflow(db, environment.id, {
      key: args.key,
      subscriber: args.subscriber,
      payload: args.payload,
      triggeredBy: user.id,
    });
  }

  @Tool({
    name: "create_workflow",
    description:
      "Create a workflow definition: a named, ordered sequence of steps (email or webhook), each with a delay relative to the previous step.",
    parameters: CreateWorkflowSchema.extend({ environmentId: z.string() }),
  })
  async createWorkflow(
    args: z.infer<typeof CreateWorkflowSchema> & { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.createWorkflow(db, environment.id, {
      key: args.key,
      name: args.name,
      description: args.description,
      type: args.type,
      steps: args.steps,
      createdBy: user.id,
    });
  }

  @Tool({
    name: "list_workflows",
    description: "List workflows in an environment.",
    parameters: ListWorkflowsQuerySchema.extend({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listWorkflows(
    args: z.infer<typeof ListWorkflowsQuerySchema> & { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.listWorkflows(db, environment.id, {
      limit: args.limit,
      offset: args.offset,
      type: args.type,
    });
  }

  @Tool({
    name: "list_environment_runs",
    description:
      "List all workflow trigger runs across every workflow in the environment, most recent first.",
    parameters: ListRunsQuerySchema.extend({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listEnvironmentRuns(
    args: z.infer<typeof ListRunsQuerySchema> & { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.listRunsForEnvironment(db, environment.id, {
      limit: args.limit,
      offset: args.offset,
    });
  }

  @Tool({
    name: "get_workflow",
    description: "Get a single workflow with its steps.",
    parameters: z.object({ environmentId: z.string(), workflowId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async getWorkflow(
    args: { environmentId: string; workflowId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.getWorkflow(
      db,
      environment.id,
      args.workflowId,
    );
  }

  @Tool({
    name: "update_workflow",
    description:
      "Update workflow fields. If `steps` is provided, it replaces ALL existing steps.",
    parameters: UpdateWorkflowSchema.extend({
      environmentId: z.string(),
      workflowId: z.string(),
    }),
  })
  async updateWorkflow(
    args: z.infer<typeof UpdateWorkflowSchema> & {
      environmentId: string;
      workflowId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.updateWorkflow(
      db,
      environment.id,
      args.workflowId,
      {
        key: args.key,
        name: args.name,
        description: args.description,
        status: args.status,
        steps: args.steps,
        updatedBy: user.id,
      },
    );
  }

  @Tool({
    name: "delete_workflow",
    description:
      "Soft-delete a workflow. Existing in-flight runs are unaffected.",
    parameters: z.object({ environmentId: z.string(), workflowId: z.string() }),
    annotations: { destructiveHint: true },
  })
  async deleteWorkflow(
    args: { environmentId: string; workflowId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    await this.workflowService.deleteWorkflow(
      db,
      environment.id,
      args.workflowId,
      user.id,
    );
    return { deleted: true };
  }

  @Tool({
    name: "list_workflow_runs",
    description: "List trigger runs for a single workflow, most recent first.",
    parameters: ListRunsQuerySchema.extend({
      environmentId: z.string(),
      workflowId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listWorkflowRuns(
    args: z.infer<typeof ListRunsQuerySchema> & {
      environmentId: string;
      workflowId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.listRuns(db, environment.id, args.workflowId, {
      limit: args.limit,
      offset: args.offset,
    });
  }

  @Tool({
    name: "preview_broadcast",
    description:
      "Resolve a broadcast's audience query and return how many subscribers currently match, without creating or sending anything. Use this to confirm a broadcast's blast radius before triggering it.",
    parameters: TriggerBroadcastSchema.extend({
      environmentId: z.string(),
      workflowId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async previewBroadcast(
    args: z.infer<typeof TriggerBroadcastSchema> & {
      environmentId: string;
      workflowId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.previewBroadcast(
      db,
      environment.id,
      args.workflowId,
      args.audience,
    );
  }

  @Tool({
    name: "trigger_broadcast",
    description:
      "Fan this workflow out to every subscriber matching the audience query. Resolving the audience and scheduling sends happens asynchronously — poll the returned broadcast (via list_broadcasts/get_broadcast) for progress. Sends real email/webhooks; call preview_broadcast first to check the matched count.",
    parameters: TriggerBroadcastSchema.extend({
      environmentId: z.string(),
      workflowId: z.string(),
    }),
    annotations: { destructiveHint: true, openWorldHint: true },
  })
  async triggerBroadcast(
    args: z.infer<typeof TriggerBroadcastSchema> & {
      environmentId: string;
      workflowId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.triggerBroadcast(
      db,
      environment.id,
      args.workflowId,
      args.audience,
      user.id,
    );
  }

  @Tool({
    name: "list_broadcasts",
    description: "List broadcasts triggered for a workflow, most recent first.",
    parameters: ListBroadcastsQuerySchema.extend({
      environmentId: z.string(),
      workflowId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listBroadcasts(
    args: z.infer<typeof ListBroadcastsQuerySchema> & {
      environmentId: string;
      workflowId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.listBroadcasts(
      db,
      environment.id,
      args.workflowId,
      {
        limit: args.limit,
        offset: args.offset,
      },
    );
  }

  @Tool({
    name: "get_broadcast",
    description:
      "Get a single broadcast with its resolved audience size and derived step-outcome counts (sent/failed/skipped/pending).",
    parameters: z.object({
      environmentId: z.string(),
      workflowId: z.string(),
      broadcastId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async getBroadcast(
    args: {
      environmentId: string;
      workflowId: string;
      broadcastId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    return this.workflowService.getBroadcast(
      db,
      environment.id,
      args.workflowId,
      args.broadcastId,
    );
  }
}
