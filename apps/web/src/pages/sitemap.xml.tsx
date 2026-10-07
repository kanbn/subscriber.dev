import { isLaunched, siteUrl, textRoute } from "~/lib/textRoute";

const PATHS = [
  "/",
  "/providers",
  "/vs/customer-io",
  "/vs/loops",
  "/vs/brevo",
  "/llms.txt",
  "/llms-full.txt",
  "/terms",
  "/privacy",
];

export const getServerSideProps = textRoute("application/xml", () =>
  isLaunched()
    ? `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PATHS.map((path) => `  <url><loc>${siteUrl()}${path}</loc></url>`).join("\n")}
</urlset>
`
    : null,
);

export default function Sitemap() {
  return null;
}
