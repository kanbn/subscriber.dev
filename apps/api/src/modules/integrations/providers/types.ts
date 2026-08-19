import type { z } from "zod";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  providerMessageId?: string;
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
}
