import { z } from "zod";

import { sendRawEmail, verifySmtpConnection } from "@subscriber.dev/email";

import type { IntegrationProvider } from "./types.js";

const configSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  fromEmail: z.string().email(),
  fromName: z.string().max(255).optional(),
  replyTo: z
    .string()
    .email()
    .optional()
    .describe(
      "Where replies go, if not fromEmail - e.g. when the sending subdomain has no inbox.",
    ),
});

// user is a secret, not config - some providers (e.g. Postmark) use the same
// token as both the SMTP username and password, so a "username" isn't
// necessarily harmless the way it would be for a plain login.
const secretSchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
});

type SmtpConfig = z.infer<typeof configSchema>;
type SmtpSecret = z.infer<typeof secretSchema>;

export const smtpProvider: IntegrationProvider<SmtpConfig, SmtpSecret> = {
  type: "smtp",
  configSchema,
  secretSchema,
  verify: async (config, secret) => {
    await verifySmtpConnection({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: secret.user,
      password: secret.password,
    });
  },
  send: async (config, secret, message) => {
    const from = config.fromName
      ? `${config.fromName} <${config.fromEmail}>`
      : config.fromEmail;

    const response = await sendRawEmail(
      {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: secret.user,
        password: secret.password,
        from,
      },
      message.to,
      message.subject,
      message.html,
      {
        text: message.text,
        headers: message.headers,
        replyTo: config.replyTo,
      },
    );

    return { providerMessageId: response.messageId };
  },
};
