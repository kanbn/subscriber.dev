import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { ListInboundEventsQuerySchema } from "../../inbound/dto/inbound-events.dto.js";
import { InboundService } from "../../inbound/inbound.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

@Injectable()
export class InboundTools {
  constructor(private readonly inboundService: InboundService) {}

  @Tool({
    name: "list_inbound_events",
    description:
      'List webhook events received from inbound sources (e.g. Stripe) for an environment, most recent first: the event type, the events it matched (trial_started, trial_converted, …), and what happened (workflow triggered, no workflow triggered by it, person not found, etc.). Use it to debug why a webhook-triggered email did or didn\'t send. Filter with `source`, e.g. "stripe".',
    parameters: ListInboundEventsQuerySchema.extend({
      environmentId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listInboundEvents(
    args: z.infer<typeof ListInboundEventsQuerySchema> & {
      environmentId: string;
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

    return this.inboundService.listEvents(db, environment.id, {
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    });
  }

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
