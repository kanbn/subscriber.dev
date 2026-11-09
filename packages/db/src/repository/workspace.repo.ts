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

export const getOwnerForEnvironment = async (
  db: dbClient,
  environmentId: number,
) => {
  const [row] = await db
    .select({ workspaceId: workspaces.id, userId: workspaces.createdBy })
    .from(environments)
    .innerJoin(workspaces, eq(environments.workspaceId, workspaces.id))
    .where(eq(environments.id, environmentId));
  return row;
};

export const getOwner = async (db: dbClient, workspaceId: number) => {
  const [row] = await db
    .select({ userId: workspaces.createdBy })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row?.userId ?? null;
};
