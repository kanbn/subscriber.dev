import type { z } from "zod";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  providerMessageId?: string;
}

export interface BounceEvent {
  email: string;
  bounceType: "hard" | "soft";
  reason: string;
  occurredAt: Date;
}

export interface IntegrationProvider<TConfig = unknown, TSecret = unknown> {
  type: string;
  configSchema: z.ZodType<TConfig, z.ZodTypeDef, any>;
  secretSchema: z.ZodType<TSecret, z.ZodTypeDef, any>;
  verify?: (config: TConfig, secret: TSecret) => Promise<void>;
  send: (
    config: TConfig,
    secret: TSecret,
    message: OutboundEmail,
  ) => Promise<SendResult>;
  // For providers with no native bounce webhook: polled periodically to
  // discover bounces that happened since the last check. `since` is omitted
  // on the first ever poll for an integration.
  checkBounces?: (
    config: TConfig,
    secret: TSecret,
    since?: Date,
  ) => Promise<BounceEvent[]>;
}
