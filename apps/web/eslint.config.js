import baseConfig, { restrictEnvAccess } from "@subscriber.dev/eslint-config/base";
import nextjsConfig from "@subscriber.dev/eslint-config/nextjs";
import reactConfig from "@subscriber.dev/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: [".next/**"],
  },
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  ...restrictEnvAccess,
];
