import { convert } from "html-to-text";
import { z } from "zod";

import type { BounceEvent, IntegrationProvider } from "./types.js";

const configSchema = z.object({
  accountId: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().max(255).optional(),
});

const secretSchema = z.object({
  apiToken: z.string().min(1),
});

type CloudflareEmailConfig = z.infer<typeof configSchema>;
type CloudflareEmailSecret = z.infer<typeof secretSchema>;

interface CloudflareApiError {
  code: number;
  message: string;
}

interface CloudflareSendResponse {
  success: boolean;
  errors: CloudflareApiError[];
  result: { message_id: string } | null;
}

interface CloudflareSuppressionEntry {
  email: string;
  reason: string;
  created_at: string;
}

interface CloudflareSuppressionListResponse {
  page: number;
  per_page: number;
  total: number;
  result: CloudflareSuppressionEntry[];
}

const SUPPRESSION_PAGE_SIZE = 1000;
const MAX_SUPPRESSION_PAGES = 1000;

// Cloudflare accepts HTML-only, but including a text part is a documented
// deliverability recommendation, not a strict requirement.
function htmlToText(html: string): string {
  return convert(html, { wordwrap: false });
}

export const cloudflareEmailProvider: IntegrationProvider<
  CloudflareEmailConfig,
  CloudflareEmailSecret
> = {
  type: "cloudflare",
  configSchema,
  secretSchema,
  verify: async (config, secret) => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/limits`,
      { headers: { Authorization: `Bearer ${secret.apiToken}` } },
    );
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      errors?: CloudflareApiError[];
    } | null;

    if (!response.ok || !body?.success) {
      const message = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare Email verification failed: ${message}`);
    }
  },
  send: async (config, secret, message) => {
    const from = config.fromName
      ? { address: config.fromEmail, name: config.fromName }
      : config.fromEmail;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: message.to,
          from,
          subject: message.subject,
          html: message.html,
          text: htmlToText(message.html),
        }),
      },
    );

    const body = (await response
      .json()
      .catch(() => null)) as CloudflareSendResponse | null;

    if (!response.ok || !body?.success || !body.result) {
      const errorMessage =
        body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare Email send failed: ${errorMessage}`);
    }

    return { providerMessageId: body.result.message_id };
  },
  // Cloudflare has no bounce webhook. Hard bounces are auto-added to the
  // account's suppression list, so that's what we poll instead. Soft
  // bounces never appear here - Cloudflare retries those internally.
  //
  // Results are fetched newest-first, so once an entry is at or before
  // `since` everything after it is old too - stop paginating there instead
  // of always re-walking the entire list.
  checkBounces: async (config, secret, since) => {
    const events: BounceEvent[] = [];
    let page = 1;

    outer: for (;;) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/suppression?page=${page}&per_page=${SUPPRESSION_PAGE_SIZE}&order=created_at&direction=desc`,
        { headers: { Authorization: `Bearer ${secret.apiToken}` } },
      );
      const body = (await response
        .json()
        .catch(() => null)) as CloudflareSuppressionListResponse | null;

      if (!response.ok || !body) {
        throw new Error(
          `Cloudflare Email suppression list fetch failed: HTTP ${response.status}`,
        );
      }

      for (const entry of body.result) {
        const occurredAt = new Date(entry.created_at);
        if (since && occurredAt <= since) break outer;

        events.push({
          email: entry.email,
          bounceType: "hard",
          reason: entry.reason,
          occurredAt,
        });
      }

      if (page * body.per_page >= body.total) break;

      page += 1;
      if (page > MAX_SUPPRESSION_PAGES) {
        throw new Error(
          `Cloudflare Email suppression list pagination exceeded ${MAX_SUPPRESSION_PAGES} pages - aborting`,
        );
      }
    }

    return events;
  },
};
