import type { z } from "zod";

export interface IntegrationProvider<TConfig = unknown, TSecret = unknown> {
  type: string;
  configSchema: z.ZodType<TConfig, z.ZodTypeDef, any>;
  secretSchema: z.ZodType<TSecret, z.ZodTypeDef, any>;
  verify?: (config: TConfig, secret: TSecret) => Promise<void>;
}
