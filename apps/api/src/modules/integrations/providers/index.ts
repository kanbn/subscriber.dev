import type { IntegrationProvider } from "./types.js";
import { smtpProvider } from "./smtp.provider.js";

export type { IntegrationProvider } from "./types.js";
export { smtpProvider } from "./smtp.provider.js";

export const INTEGRATION_PROVIDERS: Record<
  string,
  IntegrationProvider<any, any>
> = {
  smtp: smtpProvider,
};
