import type { Comparison } from "~/content";
import {
  Comment,
  CopyCommand,
  FitTable,
  LOGIN_COMMAND,
  MarketingLayout,
  MCP_ADD_COMMAND,
  Section,
} from "~/components/Marketing";

export function ComparisonPage({ c }: { c: Comparison }) {
  const title = c.title ?? `subscriber.dev vs ${c.name}`;
  return (
    <MarketingLayout
      title={title}
      description={`How subscriber.dev compares with ${c.name}: pricing, agents, sending and open source.`}
    >
      <div className="px-4 py-14 sm:px-8 sm:py-20">
        <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>
        <p className="text-muted-foreground mt-3 max-w-[60ch]">{c.lead}</p>
      </div>

      <Section title="side by side">
        <FitTable head={["", "subscriber.dev", c.name]} rows={c.rows} />
        <p className="text-muted-foreground mt-3">
          {c.name} details from{" "}
          <a
            href={c.pricingUrl}
            className="hover:text-foreground underline underline-offset-4"
          >
            their pricing page
          </a>
          , checked {c.checked}.{c.note && ` ${c.note}`}
        </p>
      </Section>

      <Section title="where subscriber.dev is different">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {c.why.map(([title, detail]) => (
            <div key={title}>
              <p className="font-semibold">
                <span className="text-muted-foreground">› </span>
                {title}
              </p>
              <p className="text-muted-foreground mt-1">{detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`when ${c.name} is the better fit`}>
        <ul className="text-muted-foreground max-w-[60ch] space-y-2">
          {c.chooseThem.map((reason) => (
            <li key={reason}>
              <span aria-hidden>- </span>
              {reason}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="switching">
        <p className="text-muted-foreground mb-6 max-w-[60ch]">
          {c.switching}
        </p>
        <div className="flex flex-col items-start gap-3">
          <Comment># from your terminal</Comment>
          <CopyCommand command={LOGIN_COMMAND} />
          <Comment># from your agent</Comment>
          <CopyCommand command={MCP_ADD_COMMAND} />
        </div>
      </Section>
    </MarketingLayout>
  );
}
