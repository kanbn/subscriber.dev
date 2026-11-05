import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";

import { WorkspaceService } from "../workspace.service.js";

function makeMockDb(returning: unknown[]) {
  const values = vi
    .fn()
    .mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) });
  const db = { insert: vi.fn().mockReturnValue({ values }) };
  return { db: db as unknown as dbClient, values };
}

describe("createEnvironment", () => {
  it("inserts a slugified environment scoped to the workspace", async () => {
    const environment = {
      id: 5,
      publicId: "env_abc",
      name: "Staging",
      slug: "staging",
    };
    const { db, values } = makeMockDb([environment]);
    const service = new WorkspaceService();

    const result = await service.createEnvironment(db, 1, 10, {
      name: "Staging",
    });

    expect(result).toEqual({
      publicId: "env_abc",
      name: "Staging",
      slug: "staging",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 1,
        name: "Staging",
        slug: "staging",
        createdBy: 10,
        updatedBy: 10,
      }),
    );
  });

  it("slugifies the name (spaces, casing, special characters)", async () => {
    const { db, values } = makeMockDb([
      { id: 5, publicId: "env_abc", name: "QA / Staging", slug: "qa-staging" },
    ]);
    const service = new WorkspaceService();

    await service.createEnvironment(db, 1, 10, { name: "QA / Staging" });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "qa-staging" }),
    );
  });

  it("throws if the insert returns nothing", async () => {
    const { db } = makeMockDb([]);
    const service = new WorkspaceService();

    await expect(
      service.createEnvironment(db, 1, 10, { name: "Staging" }),
    ).rejects.toThrow("Failed to create environment");
  });
});
