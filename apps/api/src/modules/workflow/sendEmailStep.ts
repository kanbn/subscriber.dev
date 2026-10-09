import { convert } from "html-to-text";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import { renderSubscriberEmail } from "@subscriber.dev/email";
import {
  createEmailUnsubscribeLink,
  createOneClickUnsubscribeUrl,
} from "@subscriber.dev/shared/utils";

import type { EmailLayout } from "./dto/create-workflow.dto.js";
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

function isFullHtmlDocument(html: string): boolean {
  return /<(html|body)[\s>]/i.test(html);
}

async function buildListUnsubscribeHeaders(
  subscriber: SubscriberForSend,
): Promise<Record<string, string> | undefined> {
  const oneClickUrl = await createOneClickUnsubscribeUrl(
    subscriber.environmentId,
    subscriber.publicId,
  );
  if (!oneClickUrl?.startsWith("https://")) return undefined;

  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
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

  const integrations = await environmentIntegrationsRepo.listByEnvironment(
    db,
    subscriber.environmentId,
  );
  const candidates = integrations.filter((i) => INTEGRATION_PROVIDERS[i.type]);
  if (candidates.length === 0) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      "No email integration configured for this environment",
    );
    return;
  }

  const stepConfig = runStep.configSnapshot as {
    subject: string;
    body: string;
    layout?: EmailLayout;
  };
  const unsubscribeUrl = await createEmailUnsubscribeLink(
    subscriber.environmentId,
    subscriber.publicId,
  );
  const context = { ...baseContext, unsubscribeUrl };
  const subject = await renderTemplate(stepConfig.subject, context);
  const interpolatedBody = await renderTemplate(stepConfig.body, context);
  const bodyHasUnsubscribeToken = /\{\{-?\s*unsubscribeUrl\b/.test(
    stepConfig.body,
  );
  const footerUnsubscribeUrl =
    unsubscribeUrl && !bodyHasUnsubscribeToken ? unsubscribeUrl : undefined;
  const bareHtml = footerUnsubscribeUrl
    ? `${interpolatedBody}<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${footerUnsubscribeUrl}">Unsubscribe</a></p>`
    : interpolatedBody;
  const useLayout =
    stepConfig.layout !== "none" && !isFullHtmlDocument(interpolatedBody);
  const html = useLayout
    ? await renderSubscriberEmail({
        bodyHtml: interpolatedBody,
        unsubscribeUrl: footerUnsubscribeUrl,
      })
    : bareHtml;
  const text = convert(bareHtml, { wordwrap: false });
  const headers = await buildListUnsubscribeHeaders(subscriber);

  let lastError: unknown;
  for (const integration of candidates) {
    const provider = INTEGRATION_PROVIDERS[integration.type]!;
    try {
      const providerConfig = provider.configSchema.parse(integration.config);
      const providerSecret = provider.secretSchema.parse(
        JSON.parse(decrypt(integration.encryptedSecret!)),
      );
      const result = await provider.send(providerConfig, providerSecret, {
        to: subscriber.email,
        subject,
        html,
        text,
        headers,
      });
      await workflowRunRepo.updateRunStepStatus(
        db,
        runStep.id,
        "sent",
        undefined,
        result.providerMessageId,
      );
      return;
    } catch (error) {
      // Try the next integration in priority order before giving up.
      lastError = error;
    }
  }

  await workflowRunRepo.updateRunStepStatus(
    db,
    runStep.id,
    "failed",
    lastError instanceof Error ? lastError.message : "Unknown error",
  );
  throw lastError;
}
