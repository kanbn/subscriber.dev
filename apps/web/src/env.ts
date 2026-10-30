import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod";

export const env = createEnv({
  extends: [vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_TRUSTED_ORIGINS: z
      .string()
      .transform((s) => (s === "" ? undefined : s))
      .refine(
        (s) =>
          !s ||
          s.split(",").every((l) => z.string().url().safeParse(l).success),
      )
      .optional(),
    POSTGRES_URL: z.string().url().optional().or(z.literal("")),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_USE_STANDALONE_OUTPUT: z.string().optional(),
    NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_USE_STANDALONE_OUTPUT:
      process.env.NEXT_PUBLIC_USE_STANDALONE_OUTPUT,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
