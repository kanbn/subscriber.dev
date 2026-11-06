import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environments,
  workspaceMembers,
  workspaces,
} from "@subscriber.dev/db/schema";
import { generateSlug, generateUID } from "@subscriber.dev/shared/utils";

import { isUniqueViolation } from "../../common/isUniqueViolation.js";

@Injectable()
export class WorkspaceService {
  async createWorkspace(db: dbClient, userId: number, data: { name: string }) {
    // Slugs are globally unique, so a taken name (or one with no usable
    // characters) gets the workspace's publicId appended instead of failing.
    const publicId = generateUID();
    const baseSlug = generateSlug(data.name);
    const insertWorkspace = (slug: string) =>
      db
        .insert(workspaces)
        .values({
          publicId,
          name: data.name,
          slug,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

    let workspace;
    try {
      [workspace] = await insertWorkspace(baseSlug || publicId);
    } catch (error) {
      if (!baseSlug || !isUniqueViolation(error)) throw error;
      [workspace] = await insertWorkspace(`${baseSlug}-${publicId}`);
    }

    // Create default environment
    const [environment] = await db
      .insert(environments)
      .values({
        workspaceId: workspace.id,
        name: "Production",
        slug: "prod",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    // Add user as admin member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: "admin",
      createdBy: userId,
      updatedBy: userId,
    });

    return {
      workspaceId: workspace.id,
      workspace: {
        publicId: workspace.publicId,
        name: workspace.name,
        slug: workspace.slug,
      },
      environment: {
        publicId: environment.publicId,
        name: environment.name,
        slug: environment.slug,
      },
    };
  }

  async getWorkspaceForUser(
    db: dbClient,
    userId: number,
    workspacePublicId: string,
  ) {
    const [result] = await db
      .select({
        id: workspaces.id,
        publicId: workspaces.publicId,
        name: workspaces.name,
        slug: workspaces.slug,
      })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        eq(workspaces.id, workspaceMembers.workspaceId),
      )
      .where(
        and(
          eq(workspaces.publicId, workspacePublicId),
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaces.deletedAt),
        ),
      );

    return result;
  }

  async createEnvironment(
    db: dbClient,
    workspaceId: number,
    userId: number,
    data: { name: string },
  ) {
    const slug = generateSlug(data.name);

    const [environment] = await db
      .insert(environments)
      .values({
        workspaceId,
        name: data.name,
        slug,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!environment) throw new Error("Failed to create environment");

    return {
      publicId: environment.publicId,
      name: environment.name,
      slug: environment.slug,
    };
  }

  async listEnvironmentsForWorkspace(db: dbClient, workspaceId: number) {
    return await db
      .select({
        publicId: environments.publicId,
        name: environments.name,
        slug: environments.slug,
      })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          isNull(environments.deletedAt),
        ),
      );
  }

  async updateWorkspace(
    db: dbClient,
    workspaceId: number,
    userId: number,
    data: { postalAddress?: string | null; poweredBy?: boolean },
  ) {
    const [workspace] = await db
      .update(workspaces)
      .set({
        ...data,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning({
        publicId: workspaces.publicId,
        name: workspaces.name,
        slug: workspaces.slug,
        postalAddress: workspaces.postalAddress,
        poweredBy: workspaces.poweredBy,
      });
    return workspace;
  }

  async getWorkspacesByUserId(db: dbClient, userId: number) {
    const result = await db
      .select({
        publicId: workspaces.publicId,
        name: workspaces.name,
        slug: workspaces.slug,
        postalAddress: workspaces.postalAddress,
        poweredBy: workspaces.poweredBy,
      })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        eq(workspaces.id, workspaceMembers.workspaceId),
      )
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaces.deletedAt),
        ),
      );

    return result;
  }
}
