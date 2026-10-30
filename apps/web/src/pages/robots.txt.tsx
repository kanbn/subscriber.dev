import { siteUrl, textRoute } from "~/lib/textRoute";

export const getServerSideProps = textRoute(
  "text/plain",
  () => `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap.xml\n`,
);

export default function Robots() {
  return null;
}
