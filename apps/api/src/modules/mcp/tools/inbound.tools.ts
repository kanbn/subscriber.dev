import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { InboundService } from "../../inbound/inbound.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class InboundTools {
  constructor(private readonly inboundService: InboundService) {}

  @Tool({
    name: "list_trigger_sources",
    description:
      "List integrations whose events can trigger workflows (e.g. Stripe), whether each is connected in the environment, and the events each offers. Pass a source and event as a workflow trigger in create_workflow/update_workflow; the integration must be connected first (set_integration).",
    parameters: z.object({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listTriggerSources(
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

    return this.inboundService.listTriggerSources(db, environment.id);
  }
}
