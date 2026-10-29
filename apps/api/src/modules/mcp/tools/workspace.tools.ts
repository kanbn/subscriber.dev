import { Injectable, NotFoundException } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { track } from "../../../posthog.js";
import { CreateEnvironmentSchema } from "../../workspace/dto/create-environment.dto.js";
import { CreateWorkspaceSchema } from "../../workspace/dto/create-workspace.dto.js";
import { UpdateWorkspaceSchema } from "../../workspace/dto/update-workspace.dto.js";
import { WorkspaceService } from "../../workspace/workspace.service.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class WorkspaceTools {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Tool({
    name: "list_workspaces",
    description: "List the current user's workspaces.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
  })
  async listWorkspaces(
    _args: Record<string, never>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    return this.workspaceService.getWorkspacesByUserId(db, user.id);
  }

  @Tool({
    name: "create_workspace",
    description: "Create a new workspace.",
    parameters: CreateWorkspaceSchema,
  })
  async createWorkspace(
    args: z.infer<typeof CreateWorkspaceSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);

    const result = await this.workspaceService.createWorkspace(db, user.id, {
      name: args.name,
    });
    track("workspace_created", {
      via: "mcp",
      userId: user.id,
      workspaceId: result.workspace.id,
    });
    return result;
  }

  @Tool({
    name: "update_workspace",
    description:
      "Set the workspace's postal address, shown in the footer of every email it sends. Marketing email usually includes the sender's physical address, so if list_workspaces shows postalAddress as null, offer to add one before sending broadcasts.",
    parameters: UpdateWorkspaceSchema.extend({ workspaceId: z.string() }),
  })
  async updateWorkspace(
    args: z.infer<typeof UpdateWorkspaceSchema> & { workspaceId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);

    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      args.workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return this.workspaceService.updateWorkspace(db, workspace.id, user.id, {
      postalAddress: args.postalAddress,
    });
  }

  @Tool({
    name: "list_environments",
    description: "List a workspace's environments.",
    parameters: z.object({ workspaceId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listEnvironments(
    args: { workspaceId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);

    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      args.workspaceId,
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

  @Tool({
    name: "create_environment",
    description: "Create a new environment in a workspace.",
    parameters: CreateEnvironmentSchema.extend({ workspaceId: z.string() }),
  })
  async createEnvironment(
    args: z.infer<typeof CreateEnvironmentSchema> & { workspaceId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);

    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      args.workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return this.workspaceService.createEnvironment(db, workspace.id, user.id, {
      name: args.name,
    });
  }
}
