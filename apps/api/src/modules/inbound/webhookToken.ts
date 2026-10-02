import { randomBytes } from "node:crypto";

export function withWebhookToken<T extends { webhookToken?: string }>(
  config: T,
  existing: Record<string, unknown> | undefined,
): T {
  return {
    ...config,
    webhookToken:
      typeof existing?.webhookToken === "string"
        ? existing.webhookToken
        : randomBytes(24).toString("base64url"),
  };
}

export function webhookUrl(source: string, token: unknown): string {
  return `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/webhooks/${source}/${String(token)}`;
}
