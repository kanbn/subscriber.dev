import { eq } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import { environments, workspaces } from "@subscriber.dev/db/schema";

export const getFooterForEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  const [row] = await db
    .select({
      postalAddress: workspaces.postalAddress,
      sender: workspaces.publicId,
    })
    .from(environments)
    .innerJoin(workspaces, eq(environments.workspaceId, workspaces.id))
    .where(eq(environments.id, environmentId));
  return row ?? { postalAddress: null, sender: null };
};

export const getPoweredByForEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  const [row] = await db
    .select({ poweredBy: workspaces.poweredBy })
    .from(environments)
    .innerJoin(workspaces, eq(environments.workspaceId, workspaces.id))
    .where(eq(environments.id, environmentId));
  return row?.poweredBy ?? true;
};
