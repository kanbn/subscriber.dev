import type { GetServerSideProps } from "next";

import { env } from "~/env";

export const isLaunched = () => env.NEXT_PUBLIC_SHOW_MARKETING === "true";

export const siteUrl = () =>
  (env.NEXT_PUBLIC_BASE_URL ?? "https://subscriber.dev").replace(/\/$/, "");

export function textRoute(
  contentType: string,
  body: () => string | null,
): GetServerSideProps {
  return ({ res }) => {
    const text = body();
    if (text === null) return Promise.resolve({ notFound: true });
    res.setHeader("content-type", `${contentType}; charset=utf-8`);
    res.setHeader("cache-control", "public, max-age=3600");
    res.end(text);
    return Promise.resolve({ props: {} });
  };
}
