import { UnauthorizedException } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import { initAuth } from "@subscriber.dev/auth/server";
import { createDrizzleClient } from "@subscriber.dev/db/client";

export function headersFromRaw(
  raw: Record<string, string | string[] | undefined>,
): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v: string) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }
  return headers;
}

let cachedAuth: ReturnType<typeof initAuth> | undefined;

export function getAuth() {
  const db: dbClient = createDrizzleClient();
  cachedAuth ??= initAuth(db);
  return { db, auth: cachedAuth };
}

export async function resolveSessionFromHeaders(headers: Headers) {
  const { db, auth } = getAuth();

  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    throw new UnauthorizedException("User not authenticated");
  }

  return { user: session.user, db, auth };
}
