import type { CloudflareEmailCreateValues } from "./components/CloudflareEmailCreateForm.js";
import type { IntegrationCreateValues } from "./components/IntegrationCreateForm.js";
import type {
  ProviderField,
  ProviderValues,
} from "./components/ProviderForm.js";
import type { StripeIntegrationValues } from "./components/StripeIntegrationForm.js";

function secret(value: string, editing: boolean): string | undefined {
  return editing && value.trim().length === 0 ? undefined : value;
}

export function smtpIntegrationBody(
  values: IntegrationCreateValues,
  { editing = false } = {},
) {
  return {
    host: values.host.trim(),
    port: values.port.trim(),
    secure: values.secure,
    fromEmail: values.fromEmail.trim(),
    fromName: values.fromName.trim() || undefined,
    replyTo: values.replyTo.trim() || undefined,
    user: secret(values.user.trim(), editing),
    password: secret(values.password, editing),
  };
}

export function cloudflareIntegrationBody(
  values: CloudflareEmailCreateValues,
  { editing = false } = {},
) {
  return {
    accountId: values.accountId.trim(),
    fromEmail: values.fromEmail.trim(),
    fromName: values.fromName.trim() || undefined,
    replyTo: values.replyTo.trim() || undefined,
    apiToken: secret(values.apiToken.trim(), editing),
    zoneId: values.zoneId.trim() || undefined,
  };
}

export function providerIntegrationBody(
  fields: ProviderField[],
  values: ProviderValues,
  { editing = false } = {},
) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = (values[field.key] ?? "").trim();
      return [
        field.key,
        field.secret
          ? secret(value, editing || !field.required)
          : value || undefined,
      ];
    }),
  );
}

export function stripeIntegrationBody(
  values: StripeIntegrationValues,
  { editing = false } = {},
) {
  return {
    apiKey: secret(values.apiKey.trim(), editing),
    webhookSecret: secret(values.webhookSecret.trim(), true),
  };
}
