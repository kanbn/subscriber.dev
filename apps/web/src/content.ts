import { PLANS as SHARED_PLANS } from "@subscriber.dev/shared/plans";

export const STRIPE_EVENTS = [
  "trial_started",
  "trial_ending",
  "trial_converted",
  "trial_payment_failed",
  "trial_expired",
  "subscription_started",
  "subscription_canceled",
  "payment_failed",
];

export const PLANS: [limit: number, name: string, price: number][] =
  SHARED_PLANS.map((plan) => [plan.subscribers, plan.key, plan.monthly]);

export const FAQS: [
  question: string,
  answer: string,
  link?: [href: string, label: string],
][] = [
  [
    "is there a web interface?",
    "Not a dashboard. Everything works through the API, the CLI and TUI, or your AI agent over MCP.",
  ],
  [
    "can I edit emails without code?",
    "Yes. Ask your agent to rewrite it, or open the email in the web editor to tweak the copy and preview it before it sends. It's the only place you'll leave the terminal, and only if you want to.",
  ],
  [
    "which AI agents does it work with?",
    "Any MCP client: Claude, Claude Code, Cursor, ChatGPT, Codex and others. Add the server, sign in once in the browser, and your agent can create workflows, manage subscribers and send broadcasts.",
  ],
  [
    "which email providers can I use?",
    "Resend, Postmark, Amazon SES and Cloudflare Email are built in, with bounces and spam complaints handled automatically. Anything else with SMTP works too, such as SendGrid or Mailgun. You pay your provider directly at their own rates, with no markup on sending.",
    ["/providers", "compare providers and costs"],
  ],
  [
    "how do you handle deliverability?",
    "Every email gets one-click unsubscribe headers, which Gmail and Yahoo require of bulk senders, plus an unsubscribe link. Unsubscribed people are never sent to, hard bounces unsubscribe automatically, and every preference change is kept. Mail goes out through your own provider and domain, so SPF, DKIM and your reputation stay yours.",
  ],
  [
    "can I move from Loops or Customer.io?",
    "Yes. Import subscribers through the bulk API or subscriber subscribers bulk, 500 at a time, or hand your agent an export and let it do the import. Describe your existing sequences and it can rebuild them as workflows.",
  ],
  [
    "can I get my data out?",
    "Any time. Everything is available through the API and CLI, and because it's open source you can self-host and take the whole database with you.",
  ],
  [
    "can I self-host it?",
    "Yes. It's open source under AGPL-3.0 and runs with Docker Compose. Self-hosting is free and unlimited. A $999/yr self-hosted Business license removes our branding and includes priority support, and Enterprise licenses cover AGPL exemptions.",
  ],
  [
    "why did you build subscriber.dev?",
    "We needed lifecycle email for Kan, and the options meant paying per contact and being locked into one email provider (usually SES at a large markup). We wanted our agent to set up and run it, sending through our own provider, and like Kan, we wanted it open source. Nothing did all three, so we built it.",
  ],
  [
    "who's behind it?",
    "Open Engineering, the team behind Kan, the open source Trello alternative. Kan's lifecycle and changelog emails, over 50,000 a month, all run on subscriber.dev.",
  ],
];

export const PROVIDERS_CHECKED = "October 2026";

export const PROVIDERS: {
  name: string;
  url: string;
  region: string;
  price: string;
  example: number;
  builtIn?: boolean;
}[] = [
  {
    name: "Amazon SES",
    url: "https://aws.amazon.com/ses/pricing/",
    region: "US, EU, Asia",
    price: "$0.10 per 1k",
    example: 4,
    builtIn: true,
  },
  {
    name: "Mailgun",
    url: "https://www.mailgun.com/pricing/",
    region: "US, EU",
    price: "$15 for 10k, $35 for 50k",
    example: 35,
  },
  {
    name: "Postmark",
    url: "https://postmarkapp.com/pricing",
    region: "US",
    price: "$15 for 10k, +$1.80 per 1k",
    example: 69,
    builtIn: true,
  },
  {
    name: "Scaleway",
    url: "https://www.scaleway.com/en/pricing/managed-services/",
    region: "EU",
    price: "€0.25 per 1k",
    example: 12,
  },
  {
    name: "Resend",
    url: "https://resend.com/pricing",
    region: "US, EU, more",
    price: "$20 for 50k",
    example: 20,
    builtIn: true,
  },
  {
    name: "SendGrid",
    url: "https://www.twilio.com/en-us/products/email-api/pricing",
    region: "US, EU",
    price: "$19.95 for 50k",
    example: 20,
  },
  {
    name: "Cloudflare Email",
    url: "https://developers.cloudflare.com/email-service/platform/pricing/",
    region: "global",
    price: "$5/mo + $0.35 per 1k after 3k",
    example: 18,
    builtIn: true,
  },
].sort((a, b) => a.example - b.example);

export const EXAMPLE_PLAN = { name: "growth", subscribers: 10_000, price: 39 };
export const EXAMPLE_EMAILS_EACH = 4;

export interface Comparison {
  name: string;
  title?: string;
  pricingUrl: string;
  checked: string;
  lead: string;
  rows: [string, string, string][];
  note?: string;
  why: [title: string, detail: string][];
  chooseThem: string[];
  switching: string;
}

const CUSTOMER_IO: Comparison = {
  name: "Customer.io",
  pricingUrl: "https://customer.io/pricing",
  checked: "October 2026",
  lead: "Customer.io is a full marketing platform with a visual journey builder and every channel. subscriber.dev does lifecycle email from your agent and terminal, for a fraction of the price.",
  rows: [
    ["priced by", "opted-in subscribers", "profiles (people + objects)"],
    ["5,000", "$19/mo", "$100/mo"],
    ["10,000", "$39/mo", "$145/mo"],
    ["25,000", "$79/mo", "$280/mo"],
    ["sends", "no limit on paid plans", "1M emails/mo, then add-on"],
    ["free", "1,000 subscribers", "trial"],
    ["AI agents", "MCP server", "MCP server, built-in agent"],
    ["sending", "your own provider", "theirs, or custom SMTP"],
    ["channels", "email, webhooks", "email, SMS, push, in-app"],
    ["open source", "AGPL-3.0, self-hostable", "no"],
  ],
  why: [
    [
      "a fifth of the price",
      "Customer.io starts at $100 a month for 5,000 profiles. The same list is $19 here, with no limit on sends.",
    ],
    [
      "only people who can receive email count",
      "Customer.io bills every profile, including objects. We count opted-in subscribers, nothing else.",
    ],
    [
      "built for agents and terminals",
      "Everything works over MCP, the API, a CLI and a TUI, so there's no dashboard to learn.",
    ],
    [
      "open source",
      "AGPL-3.0 and self-hostable with Docker Compose, so you're never locked in.",
    ],
  ],
  chooseThem: [
    "You need SMS, push or in-app messages alongside email.",
    "A marketing team wants a visual journey builder and drag-and-drop editor.",
    "You want Customer.io's data pipelines to route events to other tools.",
  ],
  switching:
    "Import your people through the bulk API or the CLI, 500 at a time, or hand your agent a Customer.io export. Describe your campaigns and it can rebuild them as workflows, with Stripe events as triggers and exit conditions.",
};

const LOOPS: Comparison = {
  name: "Loops",
  pricingUrl: "https://loops.so/pricing",
  checked: "October 2026",
  lead: "Loops is a polished email platform for SaaS, sending on its own infrastructure. subscriber.dev sends through your provider, is open source, and costs less than half as much.",
  rows: [
    ["priced by", "opted-in subscribers", "subscribed contacts"],
    ["free", "1,000 subscribers", "1,000 contacts"],
    ["free sends", "10,000 a month", "4,000 per 30 days"],
    ["5,000", "$19/mo", "$49/mo"],
    ["10,000", "$39/mo", "$99/mo"],
    ["25,000", "$79/mo", "$199/mo"],
    ["sends", "no limit on paid plans", "unlimited on paid plans"],
    ["AI agents", "MCP server", "MCP server"],
    ["terminal", "CLI and TUI", "CLI"],
    ["sending", "your own provider", "Loops' infrastructure"],
    ["open source", "AGPL-3.0, self-hostable", "no"],
  ],
  why: [
    [
      "less than half the price",
      "$39 a month for 10,000 subscribers against $99, and the gap holds at every tier.",
    ],
    [
      "your provider, your reputation",
      "Send through Resend, Postmark, Amazon SES, Cloudflare or any SMTP server. Your domain's reputation is yours, and you pay them directly.",
    ],
    [
      "open source",
      "AGPL-3.0 and self-hostable with Docker Compose, so you're never locked in.",
    ],
    [
      "a TUI as well as a CLI",
      "Watch runs, send broadcasts and manage workflows from a full terminal UI.",
    ],
  ],
  chooseThem: [
    "You'd rather not set up an email provider at all.",
    "You want to design emails in a visual editor with ready-made templates.",
    "You want transactional email, like receipts and password resets, through a dedicated API in the same tool.",
  ],
  switching:
    "Import your contacts through the bulk API or the CLI, 500 at a time, or hand your agent a Loops export. Describe your loops and it can rebuild them as workflows, with Stripe events as triggers and exit conditions.",
};

const BREVO: Comparison = {
  name: "Brevo",
  pricingUrl: "https://www.brevo.com/pricing/",
  checked: "October 2026",
  lead: "Brevo is an all-in-one marketing suite priced by how much you send. subscriber.dev is lifecycle email for developers and agents, priced by subscribers with no limit on sends.",
  rows: [
    ["priced by", "opted-in subscribers", "emails sent a month"],
    ["contacts", "your plan's subscribers", "unlimited"],
    ["free", "1,000 subscribers", "300 emails a day"],
    ["5,000 × 4 emails", "$19/mo", "$65/mo"],
    ["25,000 × 4 emails", "$79/mo", "$129/mo"],
    ["automation", "every plan", "Standard plan and up"],
    ["sending", "your own provider", "Brevo's infrastructure"],
    ["channels", "email, webhooks", "email, SMS, WhatsApp, chat"],
    ["open source", "AGPL-3.0, self-hostable", "no"],
  ],
  note: "Brevo rows assume four emails a month to each subscriber, on Brevo Standard, the first plan with automation.",
  why: [
    [
      "sending more doesn't cost more",
      "Brevo's price climbs with every email. Ours depends only on how many people you email, so a busier onboarding sequence costs nothing extra on a paid plan.",
    ],
    [
      "automation on every plan",
      "Workflows, triggers and exit conditions are on the free plan. Brevo needs Standard for automation.",
    ],
    [
      "built for agents and terminals",
      "Everything works over MCP, the API, a CLI and a TUI, so there's no dashboard to learn.",
    ],
    [
      "open source",
      "AGPL-3.0 and self-hostable with Docker Compose, so you're never locked in.",
    ],
  ],
  chooseThem: [
    "You have a big list you email rarely, where unlimited contacts win.",
    "You want SMS, WhatsApp, live chat and a CRM in the same tool.",
    "A marketing team wants a drag-and-drop editor and landing pages.",
  ],
  switching:
    "Import your contacts through the bulk API or the CLI, 500 at a time, or hand your agent a Brevo export. Describe your automations and it can rebuild them as workflows, with Stripe events as triggers and exit conditions.",
};

export const COMPARISONS = {
  "customer-io": CUSTOMER_IO,
  loops: LOOPS,
  brevo: BREVO,
};
