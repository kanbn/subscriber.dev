import Link from "next/link";
import { useEffect, useState } from "react";

import { DOCS_URL, Launched, MarketingLayout } from "~/components/Marketing";

const ART_WIDE = [
  "██╗  ██╗ ██████╗ ██╗  ██╗",
  "██║  ██║██╔═████╗██║  ██║",
  "███████║██║██╔██║███████║",
  "╚════██║████╔╝██║╚════██║",
  "     ██║╚██████╔╝     ██║",
  "     ╚═╝ ╚═════╝      ╚═╝",
].join("\n");
const ART_NARROW = [
  String.raw` _  _    ___  _  _   `,
  String.raw`| || |  / _ \| || |  `,
  String.raw`| || |_| | | | || |_ `,
  String.raw`|__   _| |_| |__   _|`,
  String.raw`   |_|  \___/   |_|  `,
].join("\n");

export default function NotFound() {
  const [path, setPath] = useState("");
  useEffect(() => setPath(window.location.pathname), []);

  return (
    <Launched
      page={
        <MarketingLayout
          title="Not found · subscriber.dev"
          description="This page doesn't exist."
        >
          <section className="flex flex-col items-center px-4 py-24 text-center sm:px-8 sm:py-36">
            <div role="img" aria-label="404">
              <pre
                aria-hidden
                className="text-left text-[12px] leading-[1.15] sm:hidden"
              >
                {ART_NARROW}
              </pre>
              <pre
                aria-hidden
                className="hidden text-left text-[13px] leading-[1.15] sm:block"
              >
                {ART_WIDE}
              </pre>
            </div>
            <p className="text-muted-foreground mt-8">
              no such page{path && `: ${path}`}
            </p>
            <p className="mt-4 flex gap-4">
              <Link href="/" className="hover:underline">
                home
              </Link>
              <Link href="/#pricing" className="hover:underline">
                pricing
              </Link>
              <Link href="/providers" className="hover:underline">
                providers
              </Link>
              <a href={DOCS_URL} className="hover:underline">
                docs
              </a>
            </p>
          </section>
        </MarketingLayout>
      }
    />
  );
}
