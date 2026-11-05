import { Injectable, NotFoundException } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import type { dbClient } from "@subscriber.dev/db/client";

import { BillingService } from "../../billing/billing.service.js";
import { CreateCheckoutSchema } from "../../billing/dto/billing.dto.js";
import { WorkspaceService } from "../../workspace/workspace.service.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

type RawRequest = { user?: unknown; db?: unknown } | undefined;

@Injectable()
export class BillingTools {
  constructor(
    private readonly billingService: BillingService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(rawRequest: RawRequest, workspaceId: string) {
    const user = requireMcpUser(rawRequest) as { id: number; email: string };
    const db = requireMcpDb(rawRequest) as dbClient;
    const workspace = await this.workspaceService.getWorkspaceForUser(
      db,
      user.id,
      workspaceId,
    );
    if (!workspace) throw new NotFoundException("Workspace not found");
    return { user, db, workspace };
  }

  @Tool({
    name: "get_billing",
    description:
      "Get a workspace's plan and usage. Billed subscribers are opted-in subscribers across all environments, or distinct subscribers emailed this period if more. Free: 1,000 subscribers and 10,000 sends a month, then further sends are skipped, not sent. Paid: over the plan's limit for 3 days moves the workspace up one plan (movesUpOn), and past `ceiling` (one plan up) sends to newer subscribers are skipped until the user upgrades. Plans also adjust to fit at each renewal.",
    parameters: z.object({ workspaceId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async getBilling(
    args: { workspaceId: string },
    _context: unknown,
    rawRequest: RawRequest,
  ) {
    const { db, workspace } = await this.workspace(
      rawRequest,
      args.workspaceId,
    );
    return this.billingService.getBilling(db, workspace.id);
  }

  @Tool({
    name: "create_checkout_link",
    description:
      "Start or change a paid plan. On the free plan, returns a Stripe Checkout link (kind: checkout) for the user to open; don't open it yourself. On a paid plan, changes plan or billing interval straight away (kind: changed), charging or crediting the difference, so confirm with the user first.",
    parameters: CreateCheckoutSchema.extend({ workspaceId: z.string() }),
  })
  async createCheckoutLink(
    args: z.infer<typeof CreateCheckoutSchema> & { workspaceId: string },
    _context: unknown,
    rawRequest: RawRequest,
  ) {
    const { db, user, workspace } = await this.workspace(
      rawRequest,
      args.workspaceId,
    );
    return this.billingService.createCheckoutLink(
      db,
      workspace,
      user,
      args.plan,
      args.interval,
    );
  }

  @Tool({
    name: "create_billing_portal_link",
    description:
      "Get a Stripe billing portal link where the user can change plan, update their card, see invoices or cancel. Give the link to the user to open.",
    parameters: z.object({ workspaceId: z.string() }),
  })
  async createBillingPortalLink(
    args: { workspaceId: string },
    _context: unknown,
    rawRequest: RawRequest,
  ) {
    const { db, workspace } = await this.workspace(
      rawRequest,
      args.workspaceId,
    );
    return this.billingService.createPortalLink(db, workspace.id);
  }
}
