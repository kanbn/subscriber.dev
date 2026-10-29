import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins/magic-link";
import { env } from "next-runtime-env";

import type { dbClient } from "@subscriber.dev/db/client";
import * as schema from "@subscriber.dev/db/schema";
import { sendEmail } from "@subscriber.dev/email";

// GitHub is the only social sign-in; everything else is an email link.
const configuredProviders =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : {};

export const authIssuer = () =>
  `${(env("NEXT_PUBLIC_BASE_URL") ?? "").replace(/\/$/, "")}/api/auth`;

export const mcpResourceUrls = () => [
  ...new Set(
    [
      process.env.MCP_URL,
      process.env.NEXT_PUBLIC_API_BASE_URL &&
        `${process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "")}/mcp`,
    ]
      .filter((url): url is string => !!url)
      .flatMap((url) => {
        const trimmed = url.replace(/\/$/, "");
        return [trimmed, `${trimmed}/`];
      }),
  ),
];

const isNativeRedirect = (uri: unknown) => {
  try {
    const { protocol, hostname } = new URL(String(uri));
    return protocol === "http:"
      ? ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
      : protocol !== "https:";
  } catch {
    return false;
  }
};

const inferNativeMcpClients = createAuthMiddleware((ctx) => {
  const body = ctx.body as Record<string, unknown> | undefined;
  if (
    ctx.path === "/oauth2/register" &&
    body &&
    body.application_type === undefined &&
    Array.isArray(body.redirect_uris) &&
    body.redirect_uris.length > 0 &&
    body.redirect_uris.every(isNativeRedirect)
  )
    body.application_type = "native";
  return Promise.resolve();
});

export const initAuth = (db: dbClient) => {
  const mcpResources = mcpResourceUrls();
  return betterAuth({
    disabledPaths: ["/token"],
    hooks: { before: inferNativeMcpClients },
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
      },
    },
    plugins: [
      // `subscriber login`: the CLI gets a code, the user approves it on
      // /auth, and the CLI keeps the session token and sends it as a bearer.
      deviceAuthorization({
        verificationUri: "/auth",
        validateClient: (clientId) => clientId === "subscriber-cli",
        // better-auth 1.4.6 validates `schema` as required; {} keeps the default.
        schema: {},
      }),
      bearer(),
      jwt(),
      oauthProvider({
        loginPage: "/auth",
        consentPage: "/auth/consent",
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        resources: mcpResources,
        clientRegistrationDefaultResources: mcpResources,
        enforcePerClientResources: false,
        refreshTokenReuseInterval: 60,
      }),
      magicLink({
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        sendMagicLink: async ({ email, url }) => {
          await sendEmail(email, "Sign in to subscriber.dev", "MAGIC_LINK", {
            magicLoginUrl: url,
          });
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

export const verifyMcpAccessToken = async (
  auth: ReturnType<typeof initAuth>,
  token: string,
) => {
  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: () => auth.api.getJwks(),
    jwksCacheKey: auth,
    verifyOptions: {
      audience: mcpResourceUrls(),
      issuer: authIssuer(),
      algorithms: ["EdDSA"],
    },
  });
  if (!payload.sub || typeof payload.azp !== "string") return null;
  const context = await auth.$context;
  const client = await context.adapter.findOne<{ disabled: boolean | null }>({
    model: "oauthClient",
    where: [{ field: "clientId", value: payload.azp }],
  });
  if (!client || client.disabled) return null;
  const consent = await context.adapter.findOne({
    model: "oauthConsent",
    where: [
      { field: "clientId", value: payload.azp },
      { field: "userId", value: payload.sub },
    ],
  });
  if (!consent) return null;
  return context.internalAdapter.findUserById(payload.sub);
};
