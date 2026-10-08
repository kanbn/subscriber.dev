import { fileURLToPath } from "url";
import createJiti from "jiti";
import { env } from "next-runtime-env";
import { configureRuntimeEnv } from "next-runtime-env/build/configure.js";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

configureRuntimeEnv();

/** @type {import("next").NextConfig} */
const config = {
  devIndicators: false,
  output:
    env("NEXT_PUBLIC_USE_STANDALONE_OUTPUT") === "true"
      ? "standalone"
      : undefined,
  reactStrictMode: true,

  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@subscriber.dev/db",
    "@subscriber.dev/shared",
    "@subscriber.dev/auth",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  // temporarily ignore eslint errors during build until we fix all the errors sigh
  eslint: { ignoreDuringBuilds: true },
};

export default config;
