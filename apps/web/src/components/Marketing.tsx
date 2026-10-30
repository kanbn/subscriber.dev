import type { ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import { env } from "next-runtime-env";
import { useEffect, useRef, useState } from "react";

import { PageHead } from "~/components/PageHead";

export const monoStack =
  'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

export const GITHUB_URL = "https://github.com/kanbn/subscriber.dev";
export const DOCS_URL = "https://docs.subscriber.dev";
export const MCP_URL = "https://mcp.subscriber.dev";
export const CONTACT_EMAIL = "hello@subscriber.dev";
export const LOGIN_COMMAND = "npx @subscriber.dev/cli login";
export const MCP_ADD_COMMAND = `claude mcp add --transport http subscriber ${MCP_URL}`;

function asciiTable(head: string[], rows: string[][], totalWidth = 0) {
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)),
  );
  const natural = widths.reduce((sum, w) => sum + w + 3, 1);
  const extra = Math.max(0, totalWidth - natural);
  widths.forEach((_, i) => {
    widths[i] =
      (widths[i] ?? 0) +
      Math.floor(extra / widths.length) +
      (i === widths.length - 1 ? extra % widths.length : 0);
  });
  const rule = (l: string, m: string, r: string) =>
    l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const row = (cells: string[]) =>
    "│" + cells.map((c, i) => ` ${c.padEnd(widths[i] ?? 0)} `).join("│") + "│";
  return [
    rule("┌", "┬", "┐"),
    row(head),
    rule("├", "┼", "┤"),
    ...rows.map(row),
    rule("└", "┴", "┘"),
  ].join("\n");
}

export function useFitColumns<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const probe = document.createElement("span");
      probe.textContent = "0".repeat(100);
      probe.style.visibility = "hidden";
      probe.style.position = "absolute";
      el.appendChild(probe);
      const charWidth = probe.getBoundingClientRect().width / 100;
      probe.remove();
      const style = getComputedStyle(el);
      const inner =
        el.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      setColumns(charWidth ? Math.floor(inner / charWidth) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, columns] as const;
}

export function FitTable({
  head,
  rows,
  highlight,
}: {
  head: string[];
  rows: string[][];
  highlight?: number;
}) {
  const [ref, columns] = useFitColumns<HTMLPreElement>();
  const natural = asciiTable(head, rows).split("\n")[0]?.length ?? 0;
  const stacked = columns > 0 && natural > columns;
  const labelWidth = Math.max(...head.slice(1).map((h) => h.length));
  const picked = "font-semibold text-emerald-600 dark:text-emerald-400";

  return (
    <pre
      ref={ref}
      className={`border-border bg-background-50 relative overflow-x-auto border p-4 leading-relaxed ${stacked ? "whitespace-pre-wrap" : ""}`}
    >
      {stacked
        ? rows.map((row, i) => (
            <span key={i} className={i === highlight ? picked : undefined}>
              {i > 0 && "\n"}
              <span className="font-semibold">{row[0]}</span>
              {row.slice(1).map((cell, j) => (
                <span key={j}>
                  {"\n  "}
                  <span className="text-muted-foreground">
                    {(head[j + 1] ?? "").padEnd(labelWidth)}
                  </span>
                  {`  ${cell}`}
                </span>
              ))}
              {"\n"}
            </span>
          ))
        : asciiTable(head, rows, columns)
            .split("\n")
            .map((line, i) => (
              <span
                key={i}
                className={
                  highlight !== undefined && i === highlight + 3
                    ? picked
                    : undefined
                }
              >
                {line}
                {"\n"}
              </span>
            ))}
    </pre>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-border scroll-mt-[63px] border-t px-4 py-12 sm:px-8"
    >
      <h2 className="mb-4 font-semibold">
        <span className="text-muted-foreground">## </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export const Comment = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);
export const Prompt = () => (
  <span className="text-emerald-600 dark:text-emerald-400">$ </span>
);
export const Ok = ({ children }: { children: ReactNode }) => (
  <span className="text-emerald-600 dark:text-emerald-400">{children}</span>
);

const FOOTER: [string, [string, string][]][] = [
  [
    "product",
    [
      ["pricing", "/#pricing"],
      ["providers", "/providers"],
      ["docs", DOCS_URL],
      ["github", GITHUB_URL],
    ],
  ],
  [
    "compare",
    [
      ["vs customer.io", "/vs/customer-io"],
      ["vs loops", "/vs/loops"],
      ["vs brevo", "/vs/brevo"],
    ],
  ],
  [
    "legal",
    [
      ["terms", "/terms"],
      ["privacy", "/privacy"],
    ],
  ],
  ["contact", [[CONTACT_EMAIL, `mailto:${CONTACT_EMAIL}`]]],
];

export function MarketingLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ fontFamily: monoStack }}
      className="bg-background text-foreground dark min-h-screen text-[13px] leading-relaxed [color-scheme:dark]"
    >
      <PageHead title={title} />
      <Head>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="subscriber.dev" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta
          property="og:image"
          content={`${env("NEXT_PUBLIC_BASE_URL") ?? "https://subscriber.dev"}/og.png`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="border-border mx-auto flex min-h-screen max-w-[880px] flex-col border-x">
        <nav className="border-border bg-background sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 sm:px-8">
          <Link href="/" className="font-semibold">
            subscriber.dev
          </Link>
          <div className="text-muted-foreground flex gap-4">
            <a href={DOCS_URL} className="hover:text-foreground">
              docs
            </a>
            <Link href="/#pricing" className="hover:text-foreground">
              pricing
            </Link>
            <a href={GITHUB_URL} className="hover:text-foreground">
              github
            </a>
          </div>
        </nav>

        <main className="flex-1 [&>section:first-child]:border-t-0">
          {children}
        </main>

        <footer className="border-border text-muted-foreground border-t px-4 py-8 sm:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER.map(([heading, links]) => (
              <div key={heading} className="flex flex-col items-start gap-1">
                <span className="opacity-60"># {heading}</span>
                {links.map(([label, href]) =>
                  href.startsWith("/") ? (
                    <Link
                      key={label}
                      href={href}
                      className="hover:text-foreground"
                    >
                      {label}
                    </Link>
                  ) : (
                    <a
                      key={label}
                      href={href}
                      className="hover:text-foreground"
                    >
                      {label}
                    </a>
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="mt-8 flex justify-between">
            <span>© {new Date().getFullYear()} Open Engineering</span>
            <span className="flex gap-4">
              <a href="/llms.txt" className="hover:text-foreground">
                llms.txt
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/LICENSE`}
                className="hover:text-foreground"
              >
                agpl-3.0
              </a>
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-border bg-background-50 inline-flex max-w-full items-center gap-4 border px-4 py-2">
      <code className="truncate">
        <Prompt />
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}
