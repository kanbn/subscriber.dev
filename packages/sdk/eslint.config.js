import baseConfig from "@subscriber.dev/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: ["src/generated/**"],
  },
  ...baseConfig,
];
