import baseConfig from "@subscriber.dev/eslint-config/base";
import reactConfig from "@subscriber.dev/eslint-config/react";

export default [
  ...baseConfig,
  ...reactConfig,
  {
    ignores: ["dist/**", "node_modules/**", ".turbo/**"],
  },
];
