import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import type { SetupResponse } from "../../setup/dto/setup.dto.js";
import { SetupService } from "../../setup/setup.service.js";
import { WorkspaceService } from "../../workspace/workspace.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

const GetSetupStatusSchema = z.object({
  environmentId: z
    .string()
    .optional()
    .describe(
      "The environment to check. Leave it out for a new user, or when there's only one environment.",
    ),
});

const NEXT_ACTIONS: Record<NonNullable<SetupResponse["next"]>, string> = {
  email_provider:
    "Ask which email provider they send with. Resend, Postmark and Amazon SES are built in and opt people out on bounces and spam complaints; Cloudflare Email suits a domain on Cloudflare; anything else connects over SMTP. Ask for its credentials and the address to send from, then call set_integration (its description lists each type's fields). It checks the credentials before saving. Then call send_test_email with a short subject and body to confirm it sends, and ask them to check their inbox. For Resend, Postmark and SES, help them add the webhook set_integration returns in their provider.",
  first_workflow:
    'Suggest a welcome email for new signups. Ask what their product does and the tone they want, then call create_workflow with a key such as "welcome" and one email step. Share the editUrl it returns, so they can tweak the copy in the web editor.',
  first_email_sent:
    'Send it to the user themselves: get their email with get_current_user, add them with create_subscriber, then call trigger_workflow with the workflow\'s key and that email. Check list_workflow_runs to confirm it sent, and ask them to check their inbox. Then show how their app triggers it, with POST /workflows/trigger, an API key from create_api_key in the x-api-key header, and {"key": "welcome", "subscriber": {"email": "..."}}.',
};

const COMPLETE_ACTION =
  "Setup is done. Offer any suggestions that aren't done yet: a postal address for the footer with update_workspace, and Stripe with set_integration so workflows can start on trials and payments.";

@Injectable()
export class SetupTools {
  constructor(
    private readonly setupService: SetupService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Tool({
    name: "get_setup_status",
    description:
      "The checklist for getting a new user from nothing to their first email sent, with the next thing to do. Call it when the user is new, asks to get started or set up, or nothing seems configured yet, and again after each step. Follow nextAction, asking the user for anything you need rather than inventing it.",
    parameters: GetSetupStatusSchema,
    annotations: { readOnlyHint: true },
  })
  async getSetupStatus(
    args: z.infer<typeof GetSetupStatusSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);

    let environmentId = args.environmentId;
    if (!environmentId) {
      const workspaces = await this.workspaceService.getWorkspacesByUserId(
        db,
        user.id,
      );
      if (workspaces.length === 0) {
        return {
          complete: false,
          next: "workspace",
          nextAction:
            "They don't have a workspace yet. Ask what to call it, usually their company or product, and call create_workspace. It comes with a Production environment. Then call get_setup_status again with that environment's id.",
        };
      }
      const environments =
        workspaces.length === 1
          ? await this.workspaceService.listEnvironmentsForWorkspace(
              db,
              workspaces[0].id,
            )
          : [];
      if (environments.length !== 1) {
        return {
          complete: false,
          next: "environment",
          nextAction:
            "Call list_workspaces and list_environments, ask which environment to set up if there's more than one, then call get_setup_status with its environmentId.",
        };
      }
      environmentId = environments[0].publicId;
    }

    const environment = await requireEnvironment(db, user.id, environmentId);
    const setup = await this.setupService.getSetup(db, environment.id);
    return {
      environmentId,
      ...setup,
      nextAction: setup.next ? NEXT_ACTIONS[setup.next] : COMPLETE_ACTION,
    };
  }
}
