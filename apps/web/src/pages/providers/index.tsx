import {
  FitTable,
  MarketingLayout,
  Section,
} from "~/components/Marketing";
import {
  PROVIDERS_CHECKED as CHECKED,
  EXAMPLE_EMAILS_EACH as EMAILS_EACH,
  EXAMPLE_PLAN as PLAN,
  PROVIDERS,
} from "~/content";

export default function Providers() {
  const emails = PLAN.subscribers * EMAILS_EACH;
  return (
    <MarketingLayout
      title="Email providers and costs · subscriber.dev"
      description="Which email providers work with subscriber.dev, what they cost, and what a typical month adds up to."
    >
      <div className="px-4 py-14 sm:px-8 sm:py-20">
        <h1 className="text-lg font-semibold sm:text-xl">
          email providers and costs
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[60ch]">
          subscriber.dev doesn&apos;t send email itself. Connect a provider
          and pay them directly for what you send, with no markup from us.
          Resend, Postmark, Amazon SES and Cloudflare Email are built in, and
          any SMTP server works. Need your data in the EU? Scaleway is the
          closest thing to SES there.
        </p>
      </div>

      <Section title="providers">
        <FitTable
          head={["provider", "region", "price", "connects"]}
          rows={PROVIDERS.map((p) => [
            p.name,
            p.region,
            p.price,
            p.builtIn ? "built in" : "SMTP",
          ])}
        />
        <p className="text-muted-foreground mt-3 max-w-[70ch]">
          Built-in providers pick up bounces and spam complaints and opt
          those people out automatically; over SMTP they aren&apos;t picked
          up. Cloudflare Email needs the $5 Workers Paid plan. Prices from
          each
          provider&apos;s pricing page, checked {CHECKED}:{" "}
          {PROVIDERS.map((p, i) => (
            <span key={p.name}>
              {i > 0 && ", "}
              <a
                href={p.url}
                className="hover:text-foreground underline underline-offset-4"
              >
                {p.name}
              </a>
            </span>
          ))}
          .
        </p>
      </Section>

      <Section title="what a month costs">
        <p className="text-muted-foreground mb-4 max-w-[60ch]">
          {PLAN.subscribers.toLocaleString("en-US")} subscribers, each
          emailed {EMAILS_EACH} times a month (
          {emails.toLocaleString("en-US")} emails), on the {PLAN.name} plan
          at ${PLAN.price}/mo.
        </p>
        <FitTable
          head={["provider", "sending", "subscriber.dev", "total"]}
          rows={PROVIDERS.map((p) => [
            p.name,
            `$${p.example}/mo`,
            `$${PLAN.price}/mo`,
            `$${p.example + PLAN.price}/mo`,
          ])}
        />
        <p className="text-muted-foreground mt-3 max-w-[70ch]">
          Postmark is estimated from its overage rate; a larger plan may
          cost less. Cloudflare includes the $5 Workers Paid plan, and
          Scaleway&apos;s €10 is converted to dollars. Providers also charge
          for extras such as dedicated IPs.
        </p>
      </Section>
    </MarketingLayout>
  );
}
