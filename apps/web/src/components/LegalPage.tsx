import { CONTACT_EMAIL, MarketingLayout } from "~/components/Marketing";

export const LEGAL_ENTITY = "Open Engineering";
export const LEGAL_CONTACT = CONTACT_EMAIL;

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export function LegalPage({
  title,
  description,
  updated,
  intro,
  sections,
}: {
  title: string;
  description: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <MarketingLayout
      title={`${title} · subscriber.dev`}
      description={description}
    >
      <article className="px-4 py-12 sm:px-8">
        <h1 className="font-semibold">
          <span className="text-muted-foreground"># </span>
          {title.toLowerCase()}
        </h1>
        <p className="text-muted-foreground mt-1">last updated {updated}</p>
        <p className="mt-6 max-w-[70ch]">{intro}</p>

        {sections.map((section, i) => (
          <section key={section.heading} className="mt-10 max-w-[70ch]">
            <h2 className="mb-3 font-semibold">
              <span className="text-muted-foreground">
                {String(i + 1).padStart(2, "0")}{" "}
              </span>
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground mt-3">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </MarketingLayout>
  );
}
