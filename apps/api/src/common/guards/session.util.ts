import { UnauthorizedException } from "@nestjs/common";

import { initAuth } from "@subscriber.dev/auth/server";
import { createDrizzleClient, type dbClient } from "@subscriber.dev/db/client";

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

export async function resolveSessionFromHeaders(headers: Headers) {
  const db: dbClient = createDrizzleClient();
  const auth = initAuth(db);

  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    throw new UnauthorizedException("User not authenticated");
  }

  return { user: session.user, db, auth };
}
