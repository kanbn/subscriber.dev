import type { IntegrationProvider } from "./types.js";
import { cloudflareEmailProvider } from "./cloudflareEmail.provider.js";
import { smtpProvider } from "./smtp.provider.js";

export type { IntegrationProvider } from "./types.js";
export { cloudflareEmailProvider } from "./cloudflareEmail.provider.js";
export { smtpProvider } from "./smtp.provider.js";

export const INTEGRATION_PROVIDERS: Record<
  string,
  IntegrationProvider<any, any>
> = {
  smtp: smtpProvider,
  cloudflare: cloudflareEmailProvider,
};
