import type { Subscription } from "@better-auth/stripe";
import type Stripe from "stripe";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { stripe } from "@better-auth/stripe";
import { ChatOrPushProviderEnum } from "@novu/api/models/components";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { apiKey, genericOAuth } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins/magic-link";
import { socialProviderList } from "better-auth/social-providers";
import { env } from "next-runtime-env";

import type { dbClient } from "@subscriber.dev/db/client";
import * as userRepo from "@subscriber.dev/db/repository/user.repo";
import * as schema from "@subscriber.dev/db/schema";
import { sendEmail } from "@subscriber.dev/email";
import { createStripeClient } from "@subscriber.dev/stripe";

export const configuredProviders = socialProviderList.reduce<
  Record<
    string,
    {
      clientId: string;
      clientSecret: string;
      appBundleIdentifier?: string;
      tenantId?: string;
      requireSelectAccount?: boolean;
      clientKey?: string;
      issuer?: string;
      // Google-specific optional hints
      hostedDomain?: string;
      hd?: string;
    }
  >
>((acc, provider) => {
  const id = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (id && id.length > 0 && secret && secret.length > 0) {
    acc[provider] = { clientId: id, clientSecret: secret };
  }
  if (
    provider === "apple" &&
    Object.keys(acc).includes("apple") &&
    acc[provider]
  ) {
    const bundleId =
      process.env[`${provider.toUpperCase()}_APP_BUNDLE_IDENTIFIER`];
    if (bundleId && bundleId.length > 0) {
      acc[provider].appBundleIdentifier = bundleId;
    }
  }
  if (
    provider === "gitlab" &&
    Object.keys(acc).includes("gitlab") &&
    acc[provider]
  ) {
    const issuer = process.env[`${provider.toUpperCase()}_ISSUER`];
    if (issuer && issuer.length > 0) {
      acc[provider].issuer = issuer;
    }
  }
  if (
    provider === "microsoft" &&
    Object.keys(acc).includes("microsoft") &&
    acc[provider]
  ) {
    acc[provider].tenantId = "common";
    acc[provider].requireSelectAccount = true;
  }
  // Add Google domain hint if allowed domains is configured
  if (
    provider === "google" &&
    Object.keys(acc).includes("google") &&
    acc[provider]
  ) {
    const allowed = process.env.BETTER_AUTH_ALLOWED_DOMAINS?.split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (allowed && allowed.length > 0) {
      // Use the first domain as an authorization hint
      acc[provider].hostedDomain = allowed[0];
      acc[provider].hd = allowed[0];
    }
  }
  if (
    provider === "tiktok" &&
    Object.keys(acc).includes("tiktok") &&
    acc[provider]
  ) {
    const key = process.env[`${provider.toUpperCase()}_CLIENT_KEY`];
    if (key && key.length > 0) {
      acc[provider].clientKey = key;
    }
  }
  return acc;
}, {});

export const socialProvidersPlugin = () => ({
  id: "social-providers-plugin",
  endpoints: {
    getSocialProviders: createAuthEndpoint(
      "/social-providers",
      {
        method: "GET",
      },
      async (ctx) => {
        const providers = ctx.context.socialProviders.map((p) =>
          p.id.toLowerCase(),
        );
        // Add OIDC provider if configured
        if (
          process.env.OIDC_CLIENT_ID &&
          process.env.OIDC_CLIENT_SECRET &&
          process.env.OIDC_DISCOVERY_URL
        ) {
          providers.push("oidc");
        }
        return ctx.json(providers);
      },
    ),
  },
});

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
      socialProvidersPlugin(),
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
      // Generic OIDC provider
      ...(process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET &&
      process.env.OIDC_DISCOVERY_URL
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  clientId: process.env.OIDC_CLIENT_ID,
                  clientSecret: process.env.OIDC_CLIENT_SECRET,
                  discoveryUrl: process.env.OIDC_DISCOVERY_URL,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
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
