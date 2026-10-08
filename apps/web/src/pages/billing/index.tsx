import { useRouter } from "next/router";

import { Comment, MarketingLayout, Ok, Prompt } from "~/components/Marketing";

export default function Billing() {
  const { query } = useRouter();
  const status = typeof query.status === "string" ? query.status : null;

  return (
    <MarketingLayout
      title="Billing · subscriber.dev"
      description="Your subscriber.dev plan."
    >
      <section className="px-4 py-24 sm:px-8 sm:py-36">
        <pre className="border-border bg-background-50 overflow-x-auto whitespace-pre-wrap border p-4 leading-relaxed">
          <Prompt />
          {"subscriber billing\n"}
          {status === "success" ? (
            <Ok>✓ you&apos;re all set. thanks for upgrading.</Ok>
          ) : status === "cancelled" ? (
            <span className="text-amber-600 dark:text-amber-400">
              ✕ checkout cancelled. nothing was charged.
            </span>
          ) : (
            <Ok>✓ back from the billing portal.</Ok>
          )}
          {"\n\n"}
          <Comment>
            # head back to your terminal or agent. `subscriber billing` shows
            your plan and usage.
          </Comment>
        </pre>
      </section>
    </MarketingLayout>
  );
}
