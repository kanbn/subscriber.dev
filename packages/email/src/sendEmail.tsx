import { render } from "@react-email/render";
import nodemailer from "nodemailer";

import MagicLinkTemplate from "./templates/magic-link.js";

type Templates = "MAGIC_LINK";

const emailTemplates: Record<Templates, React.FC> = {
  MAGIC_LINK: MagicLinkTemplate,
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure:
    process.env.SMTP_SECURE === undefined
      ? true
      : process.env.SMTP_SECURE?.toLowerCase() === "true",
  tls: {
    // do not fail on invalid certs
    rejectUnauthorized:
      process.env.SMTP_REJECT_UNAUTHORIZED === undefined
        ? true
        : process.env.SMTP_REJECT_UNAUTHORIZED?.toLowerCase() === "true",
  },
  ...(process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD && {
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    }),
});

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

const buildTransporter = (config: Omit<SmtpConfig, "from">) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });

export const verifySmtpConnection = async (
  config: Omit<SmtpConfig, "from">,
) => {
  await buildTransporter(config).verify();
};

export const sendRawEmail = async (
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  options: {
    text?: string;
    headers?: Record<string, string>;
    replyTo?: string;
  } = {},
) => {
  try {
    const response = await buildTransporter(config).sendMail({
      from: config.from,
      to,
      subject,
      html,
      text: options.text,
      headers: options.headers,
      replyTo: options.replyTo,
    });

    if (!response.accepted.length) {
      throw new Error(`Failed to send email: ${response.response}`);
    }

    return response;
  } catch (error) {
    console.error("Raw email sending failed:", {
      to,
      from: config.from,
      subject,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

export const sendEmail = async (
  to: string,
  subject: string,
  template: Templates,
  data: Record<string, string>,
) => {
  try {
    const EmailTemplate = emailTemplates[template];

    const html = await render(<EmailTemplate {...data} />, { pretty: true });

    const options = {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    };

    const response = await transporter.sendMail(options);

    if (!response.accepted.length) {
      throw new Error(`Failed to send email: ${response.response}`);
    }

    return response;
  } catch (error) {
    console.error("Email sending failed:", {
      to,
      from: process.env.EMAIL_FROM,
      subject,
      template,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};
