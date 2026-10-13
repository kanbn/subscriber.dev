import { z } from "zod";

import type { BounceEvent, IntegrationProvider } from "./types.js";

const configSchema = z.object({
  accountId: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().max(255).optional(),
  replyTo: z
    .string()
    .email()
    .optional()
    .describe(
      "Where replies go, if not fromEmail - e.g. when the sending subdomain has no inbox.",
    ),
  zoneId: z.string().min(1).optional(),
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

interface CloudflareEmailSendingEvent {
  datetime: string;
  status: string;
  errorCause: string;
  errorDetail: string;
  messageId: string;
}

interface CloudflareGraphQLResponse {
  data?: {
    viewer?: {
      zones?: Array<{ emailSendingAdaptive: CloudflareEmailSendingEvent[] }>;
    };
  };
  errors?: Array<{ message: string }> | null;
}

const ANALYTICS_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_EVENT_LIMIT = 1000;

const EMAIL_SENDING_EVENTS_QUERY = `
  query($zoneTag: string!, $start: Time!, $end: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        emailSendingAdaptive(
          filter: { datetime_geq: $start, datetime_leq: $end }
          limit: ${ANALYTICS_EVENT_LIMIT}
          orderBy: [datetime_ASC]
        ) {
          datetime
          status
          errorCause
          errorDetail
          messageId
        }
      }
    }
  }
`;

// Cloudflare's errorDetail embeds the raw SMTP response, e.g.
// "Permanent ... permanent error (550): 5.1.1 ..." vs
// "Temporary ... transient error (450): 4.2.0 ...". A 5xx code is a hard
// bounce; anything else (4xx, or unparseable) is treated as soft so we
// don't unsubscribe someone over an ambiguous signal.
function classifyBounce(errorDetail: string): "hard" | "soft" {
  const match = /\((\d)\d{2}\)/.exec(errorDetail);
  return match?.[1] === "5" ? "hard" : "soft";
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
    const fromName = message.fromName ?? config.fromName;
    const replyTo = message.replyTo ?? config.replyTo;
    const from = fromName
      ? { address: config.fromEmail, name: fromName }
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
          text: message.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
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
  // Cloudflare has no bounce webhook, so this polls GraphQL Analytics for
  // delivery failures instead, correlated back to the run step that sent
  // them via messageId. Needs config.zoneId, which requires a
  // Zone > Analytics > Read grant on the API token - a no-op without it.
  checkBounces: async (config, secret, since) => {
    if (!config.zoneId) return null;

    const start = since ?? new Date(Date.now() - ANALYTICS_DEFAULT_LOOKBACK_MS);
    const end = new Date();

    const response = await fetch(
      "https://api.cloudflare.com/client/v4/graphql",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: EMAIL_SENDING_EVENTS_QUERY,
          variables: {
            zoneTag: config.zoneId,
            start: start.toISOString(),
            end: end.toISOString(),
          },
        }),
      },
    );

    const body = (await response
      .json()
      .catch(() => null)) as CloudflareGraphQLResponse | null;

    if (!response.ok || !body?.data) {
      const message = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare Email analytics fetch failed: ${message}`);
    }

    const rawEvents = body.data.viewer?.zones?.[0]?.emailSendingAdaptive ?? [];

    const events: BounceEvent[] = [];
    for (const event of rawEvents) {
      if (event.status !== "deliveryFailed" || !event.messageId) continue;

      events.push({
        providerMessageId: event.messageId,
        bounceType: classifyBounce(event.errorDetail),
        reason: event.errorDetail || event.errorCause,
        occurredAt: new Date(event.datetime),
      });
    }

    return events;
  },
};
