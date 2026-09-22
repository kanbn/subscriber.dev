import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { UpsertIntegrationSchema } from "../../integrations/dto/integration.dto.js";
import { IntegrationsService } from "../../integrations/integrations.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class IntegrationsTools {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Tool({
    name: "set_integration",
    description:
      'Create or update the integration of the given type for this environment (e.g. "smtp"). Body shape depends on the integration type; secret fields (e.g. password) are encrypted at rest and never returned.',
    parameters: UpsertIntegrationSchema.extend({
      environmentId: z.string(),
      type: z.string(),
    }),
  })
  async setIntegration(
    args: z.infer<typeof UpsertIntegrationSchema> & {
      environmentId: string;
      type: string;
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

    const { environmentId, type, ...body } = args;

    return this.integrationsService.upsert(
      db,
      environment.id,
      type,
      body,
      user.id,
    );
  }

  @Tool({
    name: "set_primary_integration",
    description:
      "Move this integration to the front of the environment's failover order (tried first on send). The rest keep their relative order as fallbacks.",
    parameters: z.object({ environmentId: z.string(), type: z.string() }),
  })
  async setPrimaryIntegration(
    args: { environmentId: string; type: string },
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

    return this.integrationsService.setPrimary(db, environment.id, args.type);
  }

  @Tool({
    name: "list_integrations",
    description:
      "List every integration configured for this environment, sanitized (no secrets).",
    parameters: z.object({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listIntegrations(
    args: { environmentId: string },
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

    return this.integrationsService.list(db, environment.id);
  }

  @Tool({
    name: "get_integration",
    description:
      "Get the sanitized config for a single integration type (no secrets).",
    parameters: z.object({ environmentId: z.string(), type: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async getIntegration(
    args: { environmentId: string; type: string },
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

    return this.integrationsService.get(db, environment.id, args.type);
  }

  @Tool({
    name: "delete_integration",
    description: "Remove an integration.",
    parameters: z.object({ environmentId: z.string(), type: z.string() }),
    annotations: { destructiveHint: true },
  })
  async deleteIntegration(
    args: { environmentId: string; type: string },
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

    await this.integrationsService.delete(db, environment.id, args.type);
    return { deleted: true };
  }
}
