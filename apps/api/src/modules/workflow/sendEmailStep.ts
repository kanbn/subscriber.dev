import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import { createEmailUnsubscribeLink } from "@subscriber.dev/shared/utils";

import { decrypt } from "../../common/encryption.js";
import { INTEGRATION_PROVIDERS } from "../integrations/providers/index.js";
import { renderTemplate } from "./workflow.template.js";

interface RunStepForSend {
  id: number;
  configSnapshot: Record<string, unknown>;
}

interface SubscriberForSend {
  id: number;
  environmentId: number;
  publicId: string;
  email: string | null;
}

export async function sendEmailStep(
  db: dbClient,
  runStep: RunStepForSend,
  subscriber: SubscriberForSend,
  baseContext: Record<string, unknown>,
): Promise<void> {
  const preferences = await subscriberRepo.getLatestPreferences(
    db,
    subscriber.id,
  );
  if (preferences && !preferences.email) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "skipped",
      "Subscriber opted out of email",
    );
    return;
  }
  if (!subscriber.email) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "skipped",
      "Subscriber has no email address",
    );
    return;
  }

  const integration = await environmentIntegrationsRepo.getByEnvironmentAndType(
    db,
    subscriber.environmentId,
    "smtp",
  );
  if (!integration) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      "No SMTP integration configured for this environment",
    );
    return;
  }

  const provider = INTEGRATION_PROVIDERS[integration.type];
  if (!provider) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      `Unknown integration provider: ${integration.type}`,
    );
    return;
  }

  const providerConfig = provider.configSchema.parse(integration.config);
  const providerSecret = provider.secretSchema.parse(
    JSON.parse(decrypt(integration.encryptedSecret!)),
  );

  const stepConfig = runStep.configSnapshot as {
    subject: string;
    body: string;
  };
  const unsubscribeUrl = await createEmailUnsubscribeLink(
    subscriber.environmentId,
    subscriber.publicId,
  );
  const context = { ...baseContext, unsubscribeUrl };
  const subject = await renderTemplate(stepConfig.subject, context);
  const interpolatedBody = await renderTemplate(stepConfig.body, context);
  const bodyHasUnsubscribeToken =
    stepConfig.body.includes("{{unsubscribeUrl}}");
  const html =
    unsubscribeUrl && !bodyHasUnsubscribeToken
      ? `${interpolatedBody}<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
      : interpolatedBody;

  try {
    const result = await provider.send(providerConfig, providerSecret, {
      to: subscriber.email,
      subject,
      html,
    });
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "sent",
      undefined,
      result.providerMessageId,
    );
  } catch (error) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  }
}
