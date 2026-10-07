import type { ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PageHead } from "~/components/PageHead";

export const monoStack =
  'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

export const GITHUB_URL = "https://github.com/kanbn/subscriber.dev";
export const DOCS_URL = "https://docs.subscriber.dev";

export function asciiTable(head: string[], rows: string[][], totalWidth = 0) {
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

  return (
    <pre
      ref={ref}
      className="border-border bg-background-50 relative overflow-x-auto border p-4 leading-relaxed"
    >
      {asciiTable(head, rows, columns)
        .split("\n")
        .map((line, i) => (
          <span
            key={i}
            className={
              highlight !== undefined && i === highlight + 3
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
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

export function Block({ children }: { children: ReactNode }) {
  return (
    <pre className="border-border bg-background-50 overflow-x-auto border p-4 leading-relaxed">
      {children}
    </pre>
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
      className="bg-background text-foreground min-h-screen text-[13px] leading-relaxed"
    >
      <PageHead title={title} />
      <Head>
        <meta name="description" content={description} />
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

        <footer className="border-border text-muted-foreground flex flex-col gap-2 border-t px-4 py-6 sm:flex-row sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Open Engineering</span>
          <span className="flex gap-4">
            <a href={GITHUB_URL} className="hover:text-foreground">
              github
            </a>
            <a href={DOCS_URL} className="hover:text-foreground">
              docs
            </a>
            <Link href="/terms" className="hover:text-foreground">
              terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              privacy
            </Link>
            <span>agpl-3.0</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
