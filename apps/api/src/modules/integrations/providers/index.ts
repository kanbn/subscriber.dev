import type { ConfigurableIntegration, IntegrationProvider } from "./types.js";
import { stripeIntegration } from "../../inbound/sources/stripe/stripe.integration.js";
import { cloudflareEmailProvider } from "./cloudflareEmail.provider.js";
import { smtpProvider } from "./smtp.provider.js";

export type { ConfigurableIntegration, IntegrationProvider } from "./types.js";
export { cloudflareEmailProvider } from "./cloudflareEmail.provider.js";
export { smtpProvider } from "./smtp.provider.js";

export const INTEGRATION_PROVIDERS: Record<
  string,
  IntegrationProvider<any, any>
> = {
  smtp: smtpProvider,
  cloudflare: cloudflareEmailProvider,
};

export const CONFIGURABLE_INTEGRATIONS: Record<
  string,
  ConfigurableIntegration<any, any>
> = {
  ...INTEGRATION_PROVIDERS,
  stripe: stripeIntegration,
};
