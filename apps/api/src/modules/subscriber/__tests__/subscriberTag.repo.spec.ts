import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  addTag,
  listDistinctTagsForEnvironment,
  listTagsForSubscriber,
  removeTag,
} from "@subscriber.dev/db/repository/subscriberTag.repo";

function makeMockDb(
  overrides: Partial<{
    findMany: () => unknown;
    insertReturning: () => unknown;
    deleteReturning: () => unknown;
    orderBy: () => unknown;
  }> = {},
) {
  const findMany = overrides.findMany ?? vi.fn();
  const insertReturning =
    overrides.insertReturning ?? vi.fn().mockResolvedValue([]);
  const deleteReturning =
    overrides.deleteReturning ?? vi.fn().mockResolvedValue([]);
  const orderBy = overrides.orderBy ?? vi.fn().mockResolvedValue([]);

  const onConflictDoNothing = vi
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning });
  const selectWhere = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where: selectWhere });

  const db = {
    query: { subscriberTags: { findMany } },
    insert: vi.fn().mockReturnValue({ values }),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    selectDistinct: vi.fn().mockReturnValue({ from }),
  };

  return {
    db: db as unknown as dbClient,
    values,
    onConflictDoNothing,
    deleteWhere,
    selectWhere,
  };
}

describe("addTag", () => {
  it("inserts the tag with an onConflictDoNothing targeting (subscriberId, tag)", async () => {
    const row = { id: 1, subscriberId: 100, tag: "vip" };
    const { db, onConflictDoNothing } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([row]),
    });

    const result = await addTag(db, {
      subscriberId: 100,
      environmentId: 10,
      tag: "vip",
      createdBy: 1,
    });

    expect(result).toEqual(row);
    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    );
  });

  it("returns undefined when the tag already exists (no-op)", async () => {
    const { db } = makeMockDb({
      insertReturning: vi.fn().mockResolvedValue([]),
    });

    const result = await addTag(db, {
      subscriberId: 100,
      environmentId: 10,
      tag: "vip",
      createdBy: 1,
    });

    expect(result).toBeUndefined();
  });
});

describe("removeTag", () => {
  it("returns the deleted row", async () => {
    const row = { id: 1, subscriberId: 100, tag: "vip" };
    const { db } = makeMockDb({
      deleteReturning: vi.fn().mockResolvedValue([row]),
    });

    const result = await removeTag(db, 100, "vip");
    expect(result).toEqual(row);
  });

  it("returns undefined when the tag wasn't present", async () => {
    const { db } = makeMockDb({
      deleteReturning: vi.fn().mockResolvedValue([]),
    });

    const result = await removeTag(db, 100, "vip");
    expect(result).toBeUndefined();
  });
});

describe("listTagsForSubscriber", () => {
  it("returns every tag row for the subscriber", async () => {
    const rows = [
      { id: 1, tag: "vip" },
      { id: 2, tag: "beta" },
    ];
    const { db } = makeMockDb({ findMany: vi.fn().mockResolvedValue(rows) });

    const result = await listTagsForSubscriber(db, 100);
    expect(result).toEqual(rows);
  });
});

describe("listDistinctTagsForEnvironment", () => {
  it("returns the distinct tag names for the environment", async () => {
    const { db } = makeMockDb({
      orderBy: vi.fn().mockResolvedValue([{ tag: "beta" }, { tag: "vip" }]),
    });

    const result = await listDistinctTagsForEnvironment(db, 10);
    expect(result).toEqual(["beta", "vip"]);
  });
});
