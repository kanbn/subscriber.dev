import { and, desc, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  apikey,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  users,
} from "@subscriber.dev/db/schema";

export const getById = async (db: dbClient, id: number) => {
  return await db.query.users.findFirst({
    columns: {
      publicId: true,
      name: true,
      email: true,
      image: true,
    },
    with: {
      apiKeys: {
        columns: {
          id: true,
          prefix: true,
        },
        orderBy: desc(apikey.createdAt),
        limit: 1,
      },
    },
    where: eq(users.id, id),
  });
};

export const update = async (
  db: dbClient,
  publicId: string,
  updates: { image?: string; name?: string },
) => {
  const [result] = await db
    .update(users)
    .set({
      name: updates.name,
      image: updates.image,
    })
    .where(eq(users.publicId, publicId))
    .returning({
      publicId: users.publicId,
      name: users.name,
      image: users.image,
    });

  return result;
};

export const listAgents = async (db: dbClient, userId: number) => {
  return await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      connectedAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.createdAt));
};

export const disconnectAgent = async (
  db: dbClient,
  userId: number,
  clientId: string,
) => {
  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          eq(oauthConsent.clientId, clientId),
        ),
      )
      .returning({ id: oauthConsent.id });
    if (deleted.length === 0) return false;
    await tx
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
        ),
      );
    await tx
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, clientId),
        ),
      );
    return true;
  });
};
