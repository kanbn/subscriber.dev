import type { LegalSection } from "~/components/LegalPage";
import { LEGAL_CONTACT, LEGAL_ENTITY, LegalPage } from "~/components/LegalPage";

const SECTIONS: LegalSection[] = [
  {
    heading: "the agreement",
    paragraphs: [
      `These terms are an agreement between you and ${LEGAL_ENTITY} ("we", "us") for using the hosted subscriber.dev service, including the API, CLI, TUI, MCP server and this website. By creating an account or using the service, you accept them. If you're using it for an organisation, you confirm you can accept them on its behalf.`,
      "The self-hosted software is licensed separately, under AGPL-3.0 or a commercial license, and not under these terms.",
    ],
  },
  {
    heading: "your account",
    paragraphs: [
      "Keep your sign-in details and API keys secure. You're responsible for everything done with your account, including actions taken by AI agents, scripts or apps you've given access to.",
      "Tell us straight away if you think your account or a key has been compromised, and revoke the key.",
    ],
  },
  {
    heading: "sending email responsibly",
    paragraphs: [
      "You must follow the anti-spam and data protection laws that apply to you, such as UK GDPR, PECR, CAN-SPAM and CASL. Only email people who have agreed to hear from you or with whom you have a lawful basis to communicate.",
      "Don't use subscriber.dev to send phishing, malware, illegal or deceptive content, or to send to purchased or scraped lists. Don't try to get around rate limits, plan limits or unsubscribe handling.",
      "We add unsubscribe links and handling to your emails. You mustn't remove or disable them for marketing email.",
      "We may suspend sending or accounts that break these rules, or that put the service or other customers at risk.",
    ],
  },
  {
    heading: "your data",
    paragraphs: [
      "You own the content and subscriber data you put into subscriber.dev. You give us permission to store and process it only as needed to provide the service, as described in our privacy policy.",
      "You're responsible for having the right to use the subscriber data you send us, and for its accuracy.",
    ],
  },
  {
    heading: "email providers and integrations",
    paragraphs: [
      "subscriber.dev sends email through the provider you connect, such as your own SMTP server or Cloudflare Email, and receives events from integrations you connect, such as Stripe. Their terms apply to your use of them, and we're not responsible for their availability, deliverability or charges.",
    ],
  },
  {
    heading: "plans and billing",
    paragraphs: [
      "The free plan and paid plans are described on our pricing page. Paid plans are billed in advance, monthly or yearly, through Stripe, and renew automatically until cancelled.",
      "You can cancel at any time; your plan stays active until the end of the period you've paid for. Fees are non-refundable except where the law requires otherwise.",
      "Plans are priced by subscribers: the opted-in subscribers across all your environments, or the distinct subscribers you emailed in the billing period if that's more.",
      "If a paid plan stays over its subscriber limit for 3 days, we move you up one plan and charge the difference for the rest of the period: on your next invoice for monthly plans, or straight away for yearly plans. We warn you before this happens. You can change plan yourself at any time, charged or credited pro rata, and at each renewal your plan adjusts to the one that fits.",
      "We only move you up one plan automatically. Beyond that, emails to newer subscribers aren't sent until you upgrade, and broadcasts that would reach past it are refused.",
      "The free plan includes 1,000 subscribers and 10,000 sends a month, where a send is each email or webhook step we run, including broadcasts. Past those limits, further emails aren't sent until the next month or an upgrade. Paid plans don't limit sends, subject to reasonable use. Your email provider bills you separately for sending.",
      "We may change our prices with at least 30 days' notice. Customers on launch pricing keep their price.",
    ],
  },
  {
    heading: "changes to the service",
    paragraphs: [
      "We're continually improving subscriber.dev and may add, change or remove features. We'll give reasonable notice before removing anything significant you rely on. Features marked beta or coming soon may change or be withdrawn.",
    ],
  },
  {
    heading: "ending the agreement",
    paragraphs: [
      "You can close your account at any time. We may suspend or close accounts that break these terms, and will give notice where we reasonably can.",
      "After an account is closed, you can export your data for 30 days, after which we delete it as described in our privacy policy.",
    ],
  },
  {
    heading: "intellectual property",
    paragraphs: [
      "The hosted service, its design and the subscriber.dev name belong to us. If you send us feedback or ideas, we may use them without any obligation to you.",
    ],
  },
  {
    heading: "warranties and liability",
    paragraphs: [
      'The service is provided "as is". We work hard to keep it reliable, but we don\'t guarantee it will be uninterrupted or error-free, or that every email will be delivered.',
      "To the extent the law allows, we aren't liable for indirect or consequential losses, such as lost profits, revenue or data, and our total liability to you in any 12 months is limited to the fees you paid us in that period, or £100 if you're on the free plan.",
      "Nothing in these terms limits liability that can't legally be limited, such as for death or personal injury caused by negligence, or fraud.",
      "You agree to cover our reasonable losses if a claim is brought against us because of email you sent through subscriber.dev in breach of these terms or the law.",
    ],
  },
  {
    heading: "changes to these terms",
    paragraphs: [
      "We may update these terms. For significant changes we'll email customers at least 30 days before they take effect. Continuing to use the service after that means you accept the new terms.",
    ],
  },
  {
    heading: "governing law",
    paragraphs: [
      "These terms are governed by the laws of England and Wales, and the courts of England and Wales have jurisdiction over any disputes.",
      `Questions about these terms? Email ${LEGAL_CONTACT}.`,
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms for using subscriber.dev."
      updated="8 October 2026"
      intro="These terms cover how you can use subscriber.dev and what you can expect from us. We've tried to keep them short and in plain English."
      sections={SECTIONS}
    />
  );
}
