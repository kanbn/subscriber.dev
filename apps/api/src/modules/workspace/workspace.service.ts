import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  environments,
  workspaceMembers,
  workspaces,
} from "@subscriber.dev/db/schema";
import { generateSlug } from "@subscriber.dev/shared/utils";

@Injectable()
export class WorkspaceService {
  async createWorkspace(db: dbClient, userId: number, data: { name: string }) {
    console.log("name");
    const slug = generateSlug(data.name);

    // Create workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: data.name,
        slug,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

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
      workspace: {
        id: workspace.id,
        publicId: workspace.publicId,
        name: workspace.name,
        slug: workspace.slug,
      },
      environment: {
        id: environment.id,
        publicId: environment.publicId,
        name: environment.name,
        slug: environment.slug,
      },
    };
  }

  async getWorkspacesByUserId(db: dbClient, userId: number) {
    const result = await db
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
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaces.deletedAt),
        ),
      );

    return result;
  }
}
