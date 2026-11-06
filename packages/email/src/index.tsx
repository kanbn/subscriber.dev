export const name = "email";

export type { SmtpConfig } from "./sendEmail.js";
export { sendEmail, sendRawEmail, verifySmtpConnection } from "./sendEmail.js";
export {
  formatPostalAddress,
  poweredByUrl,
  renderSubscriberEmail,
} from "./templates/subscriber-layout.js";
