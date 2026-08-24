import { convert } from "html-to-text";
import { z } from "zod";

import type { IntegrationProvider } from "./types.js";

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
};
