import { desc, eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { apikey, users } from "@subscriber.dev/db/schema";

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
