import {
  CONTACT_EMAIL,
  DOCS_URL,
  GITHUB_URL,
  LOGIN_COMMAND,
  MCP_ADD_COMMAND,
  MCP_URL,
} from "~/components/Marketing";
import {
  COMPARISONS,
  EXAMPLE_EMAILS_EACH,
  EXAMPLE_PLAN,
  FAQS,
  PLANS,
  PROVIDERS,
  PROVIDERS_CHECKED,
  STRIPE_EVENTS,
} from "~/content";
import { siteUrl } from "~/lib/textRoute";

const n = (value: number) => value.toLocaleString("en-US");
const answer = (question: string) =>
  FAQS.find(([q]) => q === question)?.[1] ?? "";

const intro = () => `# subscriber.dev

> Open source lifecycle email for developers and AI agents. An alternative to Customer.io, Loops and Brevo with no dashboard: workflows, broadcasts and subscribers are managed over MCP, a REST API, a CLI and a TUI. Email sends through the user's own provider: Resend, Postmark, Amazon SES and Cloudflare Email are built in, with bounces and spam complaints handled; any other provider connects over SMTP.

## Connect

- MCP server (streamable HTTP): ${MCP_URL}
  - Claude Code: \`${MCP_ADD_COMMAND}\`
  - The first connection opens a browser to sign in. Signing in creates the account.
- CLI: \`${LOGIN_COMMAND}\` prints a code and opens the browser to approve it. Run \`subscriber\` with no arguments for the TUI.
- REST API: https://api.subscriber.dev, authenticated with an API key in the \`x-api-key\` header. Each key belongs to one environment; create one with MCP \`create_api_key\` or \`subscriber keys create <name>\`. Keys are limited by default (trigger workflows, create or update subscribers); pass access "full" for everything else. The key decides the environment, so paths don't include one (e.g. POST /workflows/trigger); GET /keys/me shows which environment a key belongs to.

## Typical setup

1. Sign in over MCP or with the CLI.
2. Connect an email provider: resend, postmark, ses, cloudflare or smtp (MCP \`set_integration\`, CLI \`subscriber integrations set resend\`).
3. Create a workflow: an ordered list of email or webhook steps, each with a delay. Email bodies are HTML with Liquid, e.g. {{ subscriber.firstName }}. Optional \`triggers\` start it from integration events (e.g. Stripe trial_started) and \`exitConditions\` stop a person's run on others (e.g. Stripe trial_converted).
4. Trigger it from the app after an event such as signup:

\`\`\`
POST https://api.subscriber.dev/workflows/trigger
x-api-key: <key>
content-type: application/json

{ "key": "welcome", "subscriber": { "email": "jane@acme.com" }, "payload": { "plan": "pro" } }
\`\`\`

Workflow routes such as PATCH /workflows/{workflowId} take the workflow's public ID (12 lowercase letters and digits), not its key.

## What it does

- Workflows: event-driven email sequences with delays, triggers and exit conditions.
- Broadcasts: one-off sends to all opted-in subscribers or a tag, with an audience preview, sending spread over hours, and pause, resume and cancel.
- Subscribers: create, update, tag, bulk upsert (500 per request) and preferences.
- Integrations: Stripe events (${STRIPE_EVENTS.join(", ")}) as triggers and exit conditions.
- Deliverability: ${answer("how do you handle deliverability?")}
- Run history: every run and step, with the reason a step was skipped or cancelled.

## Pricing

Priced by opted-in subscribers. The free plan includes 10,000 sends a month (each email or webhook step run, including broadcasts); paid plans don't limit sends. Emails go out through the user's own provider, which bills for sending. Annual billing is 2 months free.

${PLANS.map(
  ([limit, name, price]) =>
    `- ${name}: ${n(limit)} subscribers, ${price === 0 ? "10,000 sends a month, $0" : `$${price}/month`}`,
).join("\n")}
- custom: over ${n(PLANS[PLANS.length - 1]?.[0] ?? 0)}, contact ${CONTACT_EMAIL}

${answer("can I self-host it?")}

## Email providers

The user pays their provider directly; subscriber.dev adds no markup. Prices checked ${PROVIDERS_CHECKED}.

${PROVIDERS.map((p) => `- ${p.name} (${p.region}, ${p.builtIn ? "built in" : "SMTP"}): ${p.price}`).join("\n")}

## Moving from another tool

${answer("can I move from Loops or Customer.io?").replace(/^Yes\. /, "")}
`;

const pages = () => {
  const site = siteUrl();
  return `## Pages

- [Home](${site}/): what subscriber.dev does, with examples over MCP, the API, the CLI and the TUI, plus pricing and FAQ.
- [Email providers and costs](${site}/providers): supported providers, their prices and regions, and what a typical month costs.
${Object.entries(COMPARISONS)
  .map(
    ([slug, c]) =>
      `- [subscriber.dev vs ${c.name}](${site}/vs/${slug}): ${c.lead}`,
  )
  .join("\n")}
- [Docs](${DOCS_URL}): guides and API reference.
- [Source](${GITHUB_URL}): AGPL-3.0.
- [Full site as text](${site}/llms-full.txt): every page above in one file.

## Optional

- [Terms of service](${site}/terms)
- [Privacy policy](${site}/privacy)
- Contact: ${CONTACT_EMAIL}
`;
};

export const llmsTxt = () => `${intro()}\n${pages()}`;

export function llmsFullTxt() {
  const site = siteUrl();
  const emails = EXAMPLE_PLAN.subscribers * EXAMPLE_EMAILS_EACH;
  const sections = [
    intro(),
    `## FAQ

${FAQS.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}
`,
    `## Email providers and costs (${site}/providers)

${PROVIDERS.map((p) => `- ${p.name}: ${p.region}, ${p.builtIn ? "built in" : "SMTP"}, ${p.price}. Pricing: ${p.url}`).join("\n")}

What a month costs: ${n(EXAMPLE_PLAN.subscribers)} subscribers, each emailed ${EXAMPLE_EMAILS_EACH} times a month (${n(emails)} emails), on the ${EXAMPLE_PLAN.name} plan at $${EXAMPLE_PLAN.price}/month.

${PROVIDERS.map((p) => `- ${p.name}: $${p.example} sending + $${EXAMPLE_PLAN.price} = $${p.example + EXAMPLE_PLAN.price}/month`).join("\n")}
`,
    ...Object.entries(COMPARISONS).map(
      ([
        slug,
        c,
      ]) => `## ${c.title ?? `subscriber.dev vs ${c.name}`} (${site}/vs/${slug})

${c.lead}

${c.rows.map(([what, us, them]) => `- ${what}: subscriber.dev ${us}; ${c.name} ${them}`).join("\n")}

${c.name} details from ${c.pricingUrl}, checked ${c.checked}.${c.note ? ` ${c.note}` : ""}

Where subscriber.dev is different:
${c.why.map(([title, detail]) => `- ${title}: ${detail}`).join("\n")}

When ${c.name} is the better fit:
${c.chooseThem.map((reason) => `- ${reason}`).join("\n")}

Switching: ${c.switching}
`,
    ),
    pages(),
  ];
  return sections.join("\n");
}
