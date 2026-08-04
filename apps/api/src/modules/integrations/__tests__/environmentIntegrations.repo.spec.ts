import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  deleteIntegration,
  getByEnvironmentAndType,
  listByEnvironment,
  upsertIntegration,
} from "@subscriber.dev/db/repository/environmentIntegrations.repo";

function makeMockDb(
  overrides: Partial<{
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    insertReturning: ReturnType<typeof vi.fn>;
    deleteReturning: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const findFirst = overrides.findFirst ?? vi.fn();
  const findMany = overrides.findMany ?? vi.fn();
  const insertReturning =
    overrides.insertReturning ?? vi.fn().mockResolvedValue([]);
  const deleteReturning =
    overrides.deleteReturning ?? vi.fn().mockResolvedValue([]);

  const onConflictDoUpdate = vi
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const where = vi.fn().mockReturnValue({ returning: deleteReturning });

  const db = {
    query: { environmentIntegrations: { findFirst, findMany } },
    insert: vi.fn().mockReturnValue({ values }),
    delete: vi.fn().mockReturnValue({ where }),
  };

  return {
    db: db as unknown as dbClient,
    values,
    onConflictDoUpdate,
    where,
  };
}

describe("getByEnvironmentAndType", () => {
  it("returns the row when found", async () => {
    const row = { id: 1, type: "smtp" };
    const { db } = makeMockDb({ findFirst: vi.fn().mockResolvedValue(row) });

    const result = await getByEnvironmentAndType(db, 10, "smtp");
    expect(result).toEqual(row);
  });

  it("returns undefined when not configured", async () => {
    const { db } = makeMockDb({
      findFirst: vi.fn().mockResolvedValue(undefined),
    });

    const result = await getByEnvironmentAndType(db, 10, "smtp");
    expect(result).toBeUndefined();
  });
});

describe("listByEnvironment", () => {
  it("returns every integration for the environment", async () => {
    const rows = [{ id: 1, type: "smtp" }];
    const { db } = makeMockDb({ findMany: vi.fn().mockResolvedValue(rows) });

    const result = await listByEnvironment(db, 10);
    expect(result).toEqual(rows);
  });
});

describe("upsertIntegration", () => {
  it("inserts with an onConflictDoUpdate targeting (environmentId, type)", async () => {
    const row = { id: 1, environmentId: 10, type: "smtp" };
    const { db, onConflictDoUpdate } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([row]),
    });

    const result = await upsertIntegration(
      db,
      10,
      "smtp",
      { host: "smtp.example.com" },
      "encrypted-blob",
      1,
    );

    expect(result).toEqual(row);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          config: { host: "smtp.example.com" },
          encryptedSecret: "encrypted-blob",
          updatedBy: 1,
        }),
      }),
    );
  });

  it("throws if the upsert returns nothing", async () => {
    const { db } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([]),
    });

    await expect(
      upsertIntegration(db, 10, "smtp", {}, null, 1),
    ).rejects.toThrow("Failed to upsert integration");
  });
});

describe("deleteIntegration", () => {
  it("returns the deleted row", async () => {
    const row = { id: 1, type: "smtp" };
    const { db } = makeMockDb({
      deleteReturning: vi.fn().mockResolvedValue([row]),
    });

    const result = await deleteIntegration(db, 10, "smtp");
    expect(result).toEqual(row);
  });

  it("returns undefined when nothing was configured", async () => {
    const { db } = makeMockDb({
      deleteReturning: vi.fn().mockResolvedValue([]),
    });

    const result = await deleteIntegration(db, 10, "smtp");
    expect(result).toBeUndefined();
  });
});
