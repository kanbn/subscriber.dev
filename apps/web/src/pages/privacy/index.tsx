import type { LegalSection } from "~/components/LegalPage";
import { LEGAL_CONTACT, LEGAL_ENTITY, LegalPage } from "~/components/LegalPage";

const SECTIONS: LegalSection[] = [
  {
    heading: "who we are",
    paragraphs: [
      `subscriber.dev is operated by ${LEGAL_ENTITY} ("we", "us"), based in the United Kingdom. You can reach us about anything in this policy at ${LEGAL_CONTACT}.`,
      "This policy covers the hosted subscriber.dev service and this website. If you self-host subscriber.dev, your data stays on your own infrastructure and this policy doesn't apply to it.",
    ],
  },
  {
    heading: "two kinds of data",
    paragraphs: [
      "Account data: information about you and your team as subscriber.dev customers. For this data we are the controller.",
      "Subscriber data: the contacts, attributes and events you send us so we can email your subscribers on your behalf. For this data you are the controller and we are your processor. We only process it on your instructions, to run the service. A data processing agreement is available on request.",
    ],
  },
  {
    heading: "what we collect about customers",
    paragraphs: [
      "Account details such as your email address and name, and the workspaces, environments and workflows you create.",
      "Credentials for integrations you connect, such as your email provider or Stripe. These are encrypted at rest. API keys are stored only as a hash.",
      "Technical data such as IP addresses, request logs and error reports, used to keep the service secure and working.",
      "For paid plans, billing details are handled by Stripe. We never see or store your full card number.",
    ],
  },
  {
    heading: "how we use it",
    paragraphs: [
      "To provide, secure and support the service, to bill you for paid plans, and to tell you about important changes to the service.",
      "We may send you occasional product updates. You can unsubscribe from these at any time, and we'll still send essential service and billing messages.",
      "Our legal bases are performing our contract with you, our legitimate interest in running and improving the service securely, and complying with the law.",
    ],
  },
  {
    heading: "subscriber data",
    paragraphs: [
      "We use subscriber data only to deliver your workflows and broadcasts: sending email through the provider you connect, recording unsubscribes and bounces, and showing you run history and analytics.",
      "We never sell subscriber data, use it for our own marketing, or combine it with data from other customers.",
      "If you've received an email sent through subscriber.dev and want to access or delete your data, please contact the company that emailed you. They control that data, and we'll help them act on your request.",
    ],
  },
  {
    heading: "who we share data with",
    paragraphs: [
      "Service providers who help us run subscriber.dev, such as hosting, infrastructure and payment providers (Stripe). They may only use the data to provide their service to us.",
      "Email providers and integrations that you choose to connect. Their own terms and privacy policies apply to the data they receive.",
      "Authorities, where we're legally required to, and a successor if the business is ever sold, under the same protections.",
    ],
  },
  {
    heading: "international transfers",
    paragraphs: [
      "Some of our providers process data outside the UK. Where they do, we rely on adequacy decisions or standard contractual clauses to keep your data protected.",
    ],
  },
  {
    heading: "how long we keep it",
    paragraphs: [
      "Account data is kept while your account is active. When you close your account, we delete your account data and all subscriber data within 30 days, apart from what we must keep for legal, tax or accounting reasons.",
      "Subscriber data you delete through the API, CLI or MCP is removed from the live service straight away, and from backups as they expire.",
    ],
  },
  {
    heading: "security",
    paragraphs: [
      "Data is encrypted in transit, integration credentials are encrypted at rest, and access to production systems is restricted. No system is perfectly secure, but we'll tell you promptly if a breach affects your data.",
    ],
  },
  {
    heading: "cookies",
    paragraphs: [
      "We only use cookies that are essential for signing in. We don't use advertising or tracking cookies.",
    ],
  },
  {
    heading: "your rights",
    paragraphs: [
      "Under UK data protection law you can ask to access, correct, delete or export your personal data, or object to how we use it. Email us and we'll respond within one month.",
      "If you're unhappy with how we've handled your data, you can complain to the Information Commissioner's Office (ico.org.uk).",
    ],
  },
  {
    heading: "children",
    paragraphs: [
      "subscriber.dev is a service for businesses and isn't intended for anyone under 16.",
    ],
  },
  {
    heading: "changes",
    paragraphs: [
      "If we make significant changes to this policy we'll let customers know by email before they take effect. The date at the top shows when it was last updated.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How subscriber.dev handles your data and your subscribers' data."
      updated="6 October 2026"
      intro="This policy explains what data we collect, why, and what we do with it. The short version: we only use your data to run subscriber.dev, we never sell it, and your subscribers' data is yours."
      sections={SECTIONS}
    />
  );
}
