export const name = "email";

export type { SmtpConfig } from "./sendEmail.js";
export { sendEmail, sendRawEmail, verifySmtpConnection } from "./sendEmail.js";
export {
  POWERED_BY_URL,
  renderSubscriberEmail,
} from "./templates/subscriber-layout.js";
