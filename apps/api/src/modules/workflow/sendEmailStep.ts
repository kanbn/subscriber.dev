import { convert } from "html-to-text";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowChannels } from "@subscriber.dev/db/schema";
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
  workflow?: { channels: WorkflowChannels | null } | null,
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

  const stepConfig = runStep.configSnapshot as {
    subject: string;
    body: string;
    layout?: EmailLayout;
    previewText?: string;
  };
  const unsubscribeUrl = await createEmailUnsubscribeLink(
    subscriber.environmentId,
    subscriber.publicId,
  );
  const email = await renderEmail(stepConfig, baseContext, unsubscribeUrl);
  const headers = await buildListUnsubscribeHeaders(subscriber);

  try {
    const providerMessageId = await sendWithIntegrations(
      db,
      subscriber.environmentId,
      {
        to: subscriber.email,
        ...email,
        headers,
        fromName: workflow?.channels?.email?.fromName,
        replyTo: workflow?.channels?.email?.replyTo,
      },
    );
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "sent",
      undefined,
      providerMessageId,
    );
  } catch (error) {
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (!(error instanceof NoEmailIntegrationError)) throw error;
  }
}

export interface EmailContent {
  subject: string;
  body: string;
  layout?: EmailLayout;
  previewText?: string;
}

export async function renderEmail(
  content: EmailContent,
  baseContext: Record<string, unknown>,
  unsubscribeUrl: string | null | undefined,
): Promise<{ subject: string; html: string; text: string }> {
  const context = { ...baseContext, unsubscribeUrl };
  const subject = await renderTemplate(content.subject, context);
  const interpolatedBody = await renderTemplate(content.body, context);
  const bodyHasUnsubscribeToken = /\{\{-?\s*unsubscribeUrl\b/.test(
    content.body,
  );
  const footerUnsubscribeUrl =
    unsubscribeUrl && !bodyHasUnsubscribeToken ? unsubscribeUrl : undefined;
  const bareHtml = footerUnsubscribeUrl
    ? `${interpolatedBody}<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${footerUnsubscribeUrl}">Unsubscribe</a></p>`
    : interpolatedBody;
  const useLayout =
    content.layout !== "none" && !isFullHtmlDocument(interpolatedBody);
  const html = useLayout
    ? await renderSubscriberEmail({
        bodyHtml: interpolatedBody,
        previewText: content.previewText
          ? await renderTemplate(content.previewText, context)
          : undefined,
        unsubscribeUrl: footerUnsubscribeUrl,
      })
    : bareHtml;
  const text = convert(bareHtml, { wordwrap: false });
  return { subject, html, text };
}

export class NoEmailIntegrationError extends Error {
  constructor() {
    super("No email integration configured for this environment");
  }
}

export async function sendWithIntegrations(
  db: dbClient,
  environmentId: number,
  message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
    fromName?: string;
    replyTo?: string;
  },
): Promise<string | undefined> {
  const integrations = await environmentIntegrationsRepo.listByEnvironment(
    db,
    environmentId,
  );
  const candidates = integrations.filter((i) => INTEGRATION_PROVIDERS[i.type]);
  if (candidates.length === 0) throw new NoEmailIntegrationError();

  let lastError: unknown;
  for (const integration of candidates) {
    const provider = INTEGRATION_PROVIDERS[integration.type]!;
    try {
      const providerConfig = provider.configSchema.parse(integration.config);
      const providerSecret = provider.secretSchema.parse(
        JSON.parse(decrypt(integration.encryptedSecret!)),
      );
      const result = await provider.send(
        providerConfig,
        providerSecret,
        message,
      );
      return result.providerMessageId;
    } catch (error) {
      // Try the next integration in priority order before giving up.
      lastError = error;
    }
  }
  throw lastError;
}
