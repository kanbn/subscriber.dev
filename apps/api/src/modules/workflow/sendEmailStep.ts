import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import { sendRawEmail } from "@subscriber.dev/email";
import { createEmailUnsubscribeLink } from "@subscriber.dev/shared/utils";

import { decrypt } from "../../common/encryption.js";
import { smtpProvider } from "../integrations/providers/index.js";
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

  const smtpConfig = smtpProvider.configSchema.parse(integration.config);
  const smtpSecret = smtpProvider.secretSchema.parse(
    JSON.parse(decrypt(integration.encryptedSecret!)),
  );

  const config = runStep.configSnapshot as { subject: string; body: string };
  const unsubscribeUrl = await createEmailUnsubscribeLink(
    subscriber.environmentId,
    subscriber.publicId,
  );
  const context = { ...baseContext, unsubscribeUrl };
  const subject = await renderTemplate(config.subject, context);
  const interpolatedBody = await renderTemplate(config.body, context);
  const bodyHasUnsubscribeToken = config.body.includes("{{unsubscribeUrl}}");
  const html =
    unsubscribeUrl && !bodyHasUnsubscribeToken
      ? `${interpolatedBody}<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
      : interpolatedBody;

  try {
    await sendRawEmail(
      {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpSecret.user,
        password: smtpSecret.password,
        from: smtpConfig.fromName
          ? `${smtpConfig.fromName} <${smtpConfig.fromEmail}>`
          : smtpConfig.fromEmail,
      },
      subscriber.email,
      subject,
      html,
    );
    await workflowRunRepo.updateRunStepStatus(db, runStep.id, "sent");
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
