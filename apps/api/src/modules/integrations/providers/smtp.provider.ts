import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { z } from "zod";

import { sendRawEmail, verifySmtpConnection } from "@subscriber.dev/email";

import type { IntegrationProvider } from "./types.js";

const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const)
  privateRanges.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  privateRanges.addSubnet(network, prefix, "ipv6");

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  return privateRanges.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

export async function resolveSmtpHost(host: string) {
  if (process.env.SMTP_ALLOW_PRIVATE_HOSTS === "true") return { host };
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw new Error(`Couldn't find an SMTP server at ${host}`);
  });
  const address = addresses[0]?.address;
  if (!address || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`${host} isn't a public SMTP server`);
  }
  return { host: address, servername: isIP(host) ? undefined : host };
}

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
      ...(await resolveSmtpHost(config.host)),
      port: config.port,
      secure: config.secure,
      user: secret.user,
      password: secret.password,
    });
  },
  send: async (config, secret, message) => {
    const fromName = message.fromName ?? config.fromName;
    const from = fromName
      ? `${fromName} <${config.fromEmail}>`
      : config.fromEmail;

    const response = await sendRawEmail(
      {
        ...(await resolveSmtpHost(config.host)),
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
        replyTo: message.replyTo ?? config.replyTo,
      },
    );

    return { providerMessageId: response.messageId };
  },
};
