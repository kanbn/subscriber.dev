import { isLaunched, siteUrl, textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute("text/plain", () =>
  isLaunched()
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n",
);

export default function Robots() {
  return null;
}
