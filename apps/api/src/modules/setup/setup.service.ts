import { Injectable } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as setupRepo from "@subscriber.dev/db/repository/setup.repo";
import * as workspaceRepo from "@subscriber.dev/db/repository/workspace.repo";

import type { SetupResponse } from "./dto/setup.dto.js";
import { INTEGRATION_PROVIDERS } from "../integrations/providers/index.js";

@Injectable()
export class SetupService {
  async getSetup(db: dbClient, environmentId: number): Promise<SetupResponse> {
    const [facts, { postalAddress }] = await Promise.all([
      setupRepo.getSetupFacts(db, environmentId),
      workspaceRepo.getFooterForEnvironment(db, environmentId),
    ]);
    const steps = [
      {
        key: "email_provider" as const,
        title: "Connect an email provider",
        done: facts.integrationTypes.some(
          (type) => type in INTEGRATION_PROVIDERS,
        ),
      },
      {
        key: "first_workflow" as const,
        title: "Create a workflow",
        done: facts.workflowCount > 0,
      },
      {
        key: "first_email_sent" as const,
        title: "Trigger it and send your first email",
        done: facts.hasSentEmail,
      },
    ];
    const suggestions = [
      {
        key: "postal_address" as const,
        title: "Add your postal address to the email footer",
        done: postalAddress !== null,
      },
      {
        key: "stripe" as const,
        title:
          facts.integrationTypes.includes("stripe") && !facts.stripeWebhook
            ? "Finish connecting Stripe: it has no webhook yet, so no Stripe events reach subscriber.dev"
            : "Connect Stripe to start workflows from billing events",
        done: facts.stripeWebhook,
      },
    ];
    return {
      complete: steps.every((step) => step.done),
      next: steps.find((step) => !step.done)?.key ?? null,
      steps,
      suggestions,
    };
  }
}
