import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import { workspaces } from "@subscriber.dev/db/schema";

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

describe("createWorkspace", () => {
  function makeWorkspaceDb(firstInsert: () => Promise<unknown[]>) {
    const workspaceValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn(firstInsert) })
      .mockImplementation((v: { slug: string; publicId: string }) => ({
        returning: vi.fn().mockResolvedValue([{ id: 1, name: "Acme", ...v }]),
      }));
    const otherValues = vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue([
          { id: 2, publicId: "env_abc", name: "Production", slug: "prod" },
        ]),
    });
    const db = {
      insert: vi.fn((table: unknown) => ({
        values: table === workspaces ? workspaceValues : otherValues,
      })),
    };
    return { db: db as unknown as dbClient, workspaceValues };
  }

  it("uses the slugified name when it's free", async () => {
    const { db, workspaceValues } = makeWorkspaceDb(() =>
      Promise.resolve([{ id: 1, publicId: "p", name: "Acme", slug: "acme" }]),
    );

    const result = await new WorkspaceService().createWorkspace(db, 10, {
      name: "Acme",
    });

    expect(workspaceValues).toHaveBeenCalledTimes(1);
    expect(workspaceValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "acme" }),
    );
    expect(result.workspace.slug).toBe("acme");
  });

  it("appends the publicId when the slug is taken", async () => {
    const { db, workspaceValues } = makeWorkspaceDb(() =>
      Promise.reject(Object.assign(new Error("duplicate"), { code: "23505" })),
    );

    const result = await new WorkspaceService().createWorkspace(db, 10, {
      name: "Acme",
    });

    expect(workspaceValues).toHaveBeenCalledTimes(2);
    const [[{ publicId }]] = workspaceValues.mock.calls as [
      [{ publicId: string }],
    ];
    expect(publicId).toMatch(/^[0-9a-z]{12}$/);
    expect(result.workspace.slug).toBe(`acme-${publicId}`);
    expect(result.workspace.publicId).toBe(publicId);
  });

  it("uses the publicId as the slug when the name has no usable characters", async () => {
    const { db, workspaceValues } = makeWorkspaceDb(() =>
      Promise.resolve([{ id: 1, publicId: "p", name: "日本", slug: "x" }]),
    );

    await new WorkspaceService().createWorkspace(db, 10, { name: "日本" });

    const [[values]] = workspaceValues.mock.calls as [
      [{ publicId: string; slug: string }],
    ];
    expect(values.slug).toBe(values.publicId);
  });

  it("rethrows errors that aren't a slug collision", async () => {
    const { db } = makeWorkspaceDb(() => Promise.reject(new Error("db down")));

    await expect(
      new WorkspaceService().createWorkspace(db, 10, { name: "Acme" }),
    ).rejects.toThrow("db down");
  });
});
