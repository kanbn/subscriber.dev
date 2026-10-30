import type { GetServerSideProps } from "next";

import { env } from "~/env";

export const siteUrl = () =>
  (env.NEXT_PUBLIC_BASE_URL ?? "https://subscriber.dev").replace(/\/$/, "");

export function textRoute(
  contentType: string,
  body: () => string,
): GetServerSideProps {
  return ({ res }) => {
    res.setHeader("content-type", `${contentType}; charset=utf-8`);
    res.setHeader("cache-control", "public, max-age=3600");
    res.end(body());
    return Promise.resolve({ props: {} });
  };
}
