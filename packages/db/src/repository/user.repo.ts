import { count, desc, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { apikey, users } from "@subscriber.dev/db/schema";
import { generateUID } from "@subscriber.dev/shared/utils";

export const getCount = async (db: dbClient) => {
  const result = await db.select({ count: count() }).from(users);

  return result[0]?.count ?? 0;
};

export const getById = async (db: dbClient, id: number) => {
  return await db.query.users.findFirst({
    columns: {
      publicId: true,
      name: true,
      email: true,
      image: true,
      stripeCustomerId: true,
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

export const getByStripeCustomerId = async (
  db: dbClient,
  stripeCustomerId: string,
) => {
  return await db.query.users.findFirst({
    where: eq(users.stripeCustomerId, stripeCustomerId),
  });
};

export const getByEmail = (db: dbClient, email: string) => {
  return db.query.users.findFirst({
    columns: {
      id: true,
      name: true,
      email: true,
    },
    where: eq(users.email, email),
  });
};

export const create = async (
  db: dbClient,
  user: { id?: string; email: string; stripeCustomerId?: string },
) => {
  const [result] = await db
    .insert(users)
    .values({
      publicId: generateUID(),
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
      emailVerified: false,
    })
    .returning();

  return result;
};

export const update = async (
  db: dbClient,
  publicId: string,
  updates: { image?: string; name?: string; stripeCustomerId?: string },
) => {
  const [result] = await db
    .update(users)
    .set({
      name: updates.name,
      image: updates.image,
      stripeCustomerId: updates.stripeCustomerId,
    })
    .where(eq(users.publicId, publicId))
    .returning({
      publicId: users.publicId,
      name: users.name,
      image: users.image,
      stripeCustomerId: users.stripeCustomerId,
    });

  return result;
};
