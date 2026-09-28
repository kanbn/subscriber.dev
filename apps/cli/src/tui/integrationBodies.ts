import type { CloudflareEmailCreateValues } from "./components/CloudflareEmailCreateForm.js";
import type { IntegrationCreateValues } from "./components/IntegrationCreateForm.js";

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
