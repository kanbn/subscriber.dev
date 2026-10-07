import type { Subscription } from "@better-auth/stripe";
import type Stripe from "stripe";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { stripe } from "@better-auth/stripe";
import { ChatOrPushProviderEnum } from "@novu/api/models/components";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey, bearer, deviceAuthorization } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins/magic-link";
import { env } from "next-runtime-env";

import type { dbClient } from "@subscriber.dev/db/client";
import * as userRepo from "@subscriber.dev/db/repository/user.repo";
import * as schema from "@subscriber.dev/db/schema";
import { sendEmail } from "@subscriber.dev/email";
import { createStripeClient } from "@subscriber.dev/stripe";

// GitHub is the only social sign-in; everything else is an email link.
export const configuredProviders =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : {};

export const initAuth = (db: dbClient) => {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: env("NEXT_PUBLIC_BASE_URL"),
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? [
          env("NEXT_PUBLIC_BASE_URL") ?? "",
          ...process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(","),
        ]
      : [env("NEXT_PUBLIC_BASE_URL") ?? ""],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        ...schema,
        user: schema.users,
      },
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 2, // Update session expiry every 48 hours if user is active
      freshAge: 0,
    },
    emailAndPassword: {
      enabled: env("NEXT_PUBLIC_ALLOW_CREDENTIALS")?.toLowerCase() === "true",
      disableSignUp:
        env("NEXT_PUBLIC_DISABLE_SIGN_UP")?.toLowerCase() === "true",
      sendResetPassword: async (data) => {
        await sendEmail(data.user.email, "Reset Password", "RESET_PASSWORD", {
          resetPasswordUrl: data.url,
          resetPasswordToken: data.token,
        });
      },
    },
    socialProviders: configuredProviders,
    user: {
      deleteUser: {
        enabled: true,
      },
      additionalFields: {
        publicId: {
          type: "string",
          required: true,
        },
        stripeCustomerId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
      },
    },
    plugins: [
      // `subscriber login`: the CLI gets a code, the user approves it on
      // /auth, and the CLI swaps the session token (sent as a bearer) for an
      // API key.
      deviceAuthorization({
        verificationUri: "/auth",
        validateClient: (clientId) => clientId === "subscriber-cli",
        // better-auth 1.4.6 validates `schema` as required; {} keeps the default.
        schema: {},
      }),
      bearer(),
      apiKey({
        enableSessionForAPIKeys: true,
        rateLimit: {
          enabled: true,
          timeWindow: 1000 * 60, // 1 minute
          maxRequests: 100, // 100 requests per minute
        },
      }),
      magicLink({
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        sendMagicLink: async ({ email, url }) => {
          if (url.includes("type=invite")) {
            await sendEmail(
              email,
              "Invitation to join workspace",
              "JOIN_WORKSPACE",
              {
                magicLoginUrl: url,
              },
            );
          } else {
            await sendEmail(email, "Sign in to subscriber.dev", "MAGIC_LINK", {
              magicLoginUrl: url,
            });
          }
        },
      }),
    ],
    advanced: {
      cookiePrefix: "subscriber.dev",
      crossSubDomainCookies: {
        enabled: true,
        domain: (() => {
          const baseUrl = env("NEXT_PUBLIC_BASE_URL");
          if (!baseUrl) return undefined;
          try {
            return new URL(baseUrl).hostname;
          } catch {
            return baseUrl;
          }
        })(),
      },
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
      },
      database: {
        generateId: false,
      },
    },
  });
};
