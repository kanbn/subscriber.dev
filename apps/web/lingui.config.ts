import type { LinguiConfig } from "@lingui/conf";

const config: LinguiConfig = {
  locales: ["en"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/node_modules/**"],
    },
  ],
};

export default config;
