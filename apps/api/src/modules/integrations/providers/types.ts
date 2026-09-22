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
  providerMessageId: string;
  bounceType: "hard" | "soft";
  reason: string;
  occurredAt: Date;
}

export interface IntegrationProvider<TConfig = unknown, TSecret = unknown> {
  type: string;
  configSchema: z.ZodType<TConfig>;
  secretSchema: z.ZodType<TSecret>;
  verify?: (config: TConfig, secret: TSecret) => Promise<void>;
  send: (
    config: TConfig,
    secret: TSecret,
    message: OutboundEmail,
  ) => Promise<SendResult>;
  checkBounces?: (
    config: TConfig,
    secret: TSecret,
    since?: Date,
  ) => Promise<BounceEvent[] | null>;
}
