import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  deleteIntegration,
  getByEnvironmentAndType,
  listByEnvironment,
  setPrimary,
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

  const txSet = vi.fn().mockReturnValue({ where: vi.fn() });
  const txUpdate = vi.fn().mockReturnValue({ set: txSet });
  const transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({ update: txUpdate });
    });

  const db = {
    query: { environmentIntegrations: { findFirst, findMany } },
    insert: vi.fn().mockReturnValue({ values }),
    delete: vi.fn().mockReturnValue({ where }),
    transaction,
  };

  return {
    db: db as unknown as dbClient,
    values,
    onConflictDoUpdate,
    where,
    transaction,
    txUpdate,
    txSet,
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

  it("sets priority in the insert values but not in the onConflictDoUpdate set, so reconfiguring an existing integration doesn't move it", async () => {
    const row = { id: 1, environmentId: 10, type: "smtp" };
    const { db, values, onConflictDoUpdate } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([row]),
    });

    await upsertIntegration(db, 10, "smtp", {}, null, 1, 3);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 3 }),
    );
    const setArg = onConflictDoUpdate.mock.calls[0]![0].set;
    expect(setArg).not.toHaveProperty("priority");
  });

  it("throws if the upsert returns nothing", async () => {
    const { db } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([]),
    });

    await expect(
      upsertIntegration(db, 10, "smtp", {}, null, 1, 1),
    ).rejects.toThrow("Failed to upsert integration");
  });
});

describe("setPrimary", () => {
  it("moves the target to priority 1 and shifts the rest after it, preserving their relative order", async () => {
    const rows = [
      { id: 1, type: "smtp", priority: 1 },
      { id: 2, type: "cloudflare", priority: 2 },
      { id: 3, type: "ses", priority: 3 },
    ];
    const { db, txUpdate, txSet } = makeMockDb({
      findMany: vi.fn().mockResolvedValue(rows),
    });

    const result = await setPrimary(db, 10, "ses");

    expect(result).toEqual({ id: 3, type: "ses", priority: 1 });
    // New order: ses(1), smtp(1->2), cloudflare(2->3)
    expect(txUpdate).toHaveBeenCalledTimes(3);
    expect(txSet.mock.calls).toEqual([
      [{ priority: 1 }],
      [{ priority: 2 }],
      [{ priority: 3 }],
    ]);
  });

  it("returns undefined when the type isn't configured", async () => {
    const { db, transaction } = makeMockDb({
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 1, type: "smtp", priority: 1 }]),
    });

    const result = await setPrimary(db, 10, "cloudflare");

    expect(result).toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("is a no-op reorder when the target is already primary", async () => {
    const rows = [
      { id: 1, type: "smtp", priority: 1 },
      { id: 2, type: "cloudflare", priority: 2 },
    ];
    const { db, txSet } = makeMockDb({
      findMany: vi.fn().mockResolvedValue(rows),
    });

    const result = await setPrimary(db, 10, "smtp");

    expect(result).toEqual({ id: 1, type: "smtp", priority: 1 });
    expect(txSet.mock.calls).toEqual([[{ priority: 1 }], [{ priority: 2 }]]);
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
