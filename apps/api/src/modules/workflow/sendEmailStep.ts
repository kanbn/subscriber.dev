import { convert } from "html-to-text";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowChannels } from "@subscriber.dev/db/schema";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as setupRepo from "@subscriber.dev/db/repository/setup.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import * as workspaceRepo from "@subscriber.dev/db/repository/workspace.repo";
import {
  formatPostalAddress,
  poweredByUrl,
  renderSubscriberEmail,
} from "@subscriber.dev/email";
import {
  createEmailUnsubscribeLink,
  createOneClickUnsubscribeUrl,
} from "@subscriber.dev/shared/utils";

import type { EmailLayout } from "./dto/create-workflow.dto.js";
import { decrypt } from "../../common/encryption.js";
import { track } from "../../posthog.js";
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
  poweredBy = false,
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
  const email = await renderEmail(stepConfig, baseContext, unsubscribeUrl, {
    poweredBy,
    ...(await workspaceRepo.getFooterForEnvironment(
      db,
      subscriber.environmentId,
    )),
  });
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
    const first = !(await setupRepo.hasSentEmail(db, subscriber.environmentId));
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "sent",
      undefined,
      providerMessageId,
    );
    if (first) {
      const owner = await workspaceRepo.getOwnerForEnvironment(
        db,
        subscriber.environmentId,
      );
      if (owner) track("first_email_sent", { via: "workflow", ...owner });
    }
  } catch (error) {
    if (!(error instanceof NoEmailIntegrationError)) throw error;
    await workflowRunRepo.updateRunStepStatus(
      db,
      runStep.id,
      "failed",
      error.message,
    );
  }
}

export interface EmailContent {
  subject: string;
  body: string;
  layout?: EmailLayout;
  previewText?: string;
}

export interface EmailFooter {
  poweredBy?: boolean;
  postalAddress?: string | null;
  /** Workspace publicId, sent as utm_campaign on the Powered by link. */
  sender?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderEmail(
  content: EmailContent,
  baseContext: Record<string, unknown>,
  unsubscribeUrl: string | null | undefined,
  { poweredBy = false, postalAddress, sender }: EmailFooter = {},
): Promise<{ subject: string; html: string; text: string }> {
  const context = { ...baseContext, unsubscribeUrl };
  const subject = await renderTemplate(content.subject, context);
  const interpolatedBody = await renderTemplate(content.body, context, {
    html: true,
  });
  const bodyHasUnsubscribeToken = /\{\{-?\s*unsubscribeUrl\b/.test(
    content.body,
  );
  const address = formatPostalAddress(postalAddress);
  const footerUnsubscribeUrl =
    unsubscribeUrl && !bodyHasUnsubscribeToken ? unsubscribeUrl : undefined;
  const bareHtml = [
    interpolatedBody,
    footerUnsubscribeUrl
      ? `<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${footerUnsubscribeUrl}">Unsubscribe</a></p>`
      : "",
    address
      ? `<p style="font-size:12px;color:#666;">${escapeHtml(address)}</p>`
      : "",
    poweredBy
      ? `<p style="font-size:12px;color:#666;">Powered by <a href="${escapeHtml(poweredByUrl(sender))}">subscriber.dev</a></p>`
      : "",
  ].join("");
  const useLayout =
    content.layout !== "none" && !isFullHtmlDocument(interpolatedBody);
  const html = useLayout
    ? await renderSubscriberEmail({
        bodyHtml: interpolatedBody,
        previewText: content.previewText
          ? await renderTemplate(content.previewText, context)
          : undefined,
        unsubscribeUrl: footerUnsubscribeUrl,
        postalAddress,
        poweredBy,
        sender,
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
