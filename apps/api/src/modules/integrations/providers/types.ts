import type { z } from "zod";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  fromName?: string;
  replyTo?: string;
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

export interface ConfigurableIntegration<TConfig = unknown, TSecret = unknown> {
  type: string;
  configSchema: z.ZodType<TConfig>;
  secretSchema: z.ZodType<TSecret>;
  verify?: (config: TConfig, secret: TSecret) => Promise<void>;
  prepareConfig?: (
    config: TConfig,
    existing: Record<string, unknown> | undefined,
  ) => TConfig;
  connect?: (
    config: TConfig,
    secret: TSecret,
  ) => Promise<{ config: TConfig; secret: TSecret }>;
  disconnect?: (config: TConfig, secret: TSecret) => Promise<void>;
  describe?: (config: Record<string, unknown>) => Record<string, unknown>;
}

export interface IntegrationProvider<
  TConfig = unknown,
  TSecret = unknown,
> extends ConfigurableIntegration<TConfig, TSecret> {
  send: (
    config: TConfig,
    secret: TSecret,
    message: OutboundEmail,
  ) => Promise<SendResult>;
  parseWebhook?: (input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    secret: TSecret;
  }) => BounceEvent[] | Promise<BounceEvent[]>;
  checkBounces?: (
    config: TConfig,
    secret: TSecret,
    since?: Date,
  ) => Promise<BounceEvent[] | null>;
}
