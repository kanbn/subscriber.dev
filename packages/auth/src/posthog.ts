import { PostHog } from "posthog-node";

export const posthog =
  process.env.POSTHOG_PROJECT_TOKEN && process.env.POSTHOG_HOST
    ? new PostHog(process.env.POSTHOG_PROJECT_TOKEN, {
        host: process.env.POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
        enableExceptionAutocapture: true,
      })
    : undefined;
