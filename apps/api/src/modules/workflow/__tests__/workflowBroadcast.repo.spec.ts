import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  createBroadcast,
  getBroadcastById,
  updateBroadcastProgress,
} from "@subscriber.dev/db/repository/workflowBroadcast.repo";

function makeInsertChain(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function makeUpdateChain(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function makeMockDb(
  overrides: Partial<{
    findFirst: ReturnType<typeof vi.fn>;
    insertChain: { values: ReturnType<typeof vi.fn> };
    updateChain: ReturnType<typeof makeUpdateChain>;
  }> = {},
) {
  const findFirst = overrides.findFirst ?? vi.fn();
  const insertChain = overrides.insertChain ?? makeInsertChain([]);
  const updateChain = overrides.updateChain ?? makeUpdateChain([]);

  const db = {
    query: { workflowBroadcasts: { findFirst } },
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  };

  return db as unknown as dbClient;
}

describe("createBroadcast", () => {
  it("inserts and returns the broadcast row", async () => {
    const row = { id: 1, publicId: "bc_abc", workflowId: 5 };
    const db = makeMockDb({
      insertChain: makeInsertChain([row]),
    });

    const result = await createBroadcast(db, {
      workflowId: 5,
      environmentId: 10,
      audienceQuery: { type: "optedIn" },
      createdBy: 1,
    });

    expect(result).toEqual(row);
  });

  it("throws if the insert returns nothing", async () => {
    const db = makeMockDb({ insertChain: makeInsertChain([]) });

    await expect(
      createBroadcast(db, {
        workflowId: 5,
        environmentId: 10,
        audienceQuery: { type: "optedIn" },
        createdBy: 1,
      }),
    ).rejects.toThrow("Failed to create broadcast");
  });
});

describe("getBroadcastById", () => {
  it("returns the broadcast when found", async () => {
    const row = { id: 1, status: "pending" };
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(row) });

    const result = await getBroadcastById(db, 1);
    expect(result).toEqual(row);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(undefined) });

    const result = await getBroadcastById(db, 999);
    expect(result).toBeUndefined();
  });
});

describe("updateBroadcastProgress", () => {
  it("updates matchedCount and status", async () => {
    const row = { id: 1, matchedCount: 42, status: "queued" };
    const updateChain = makeUpdateChain([row]);
    const db = makeMockDb({ updateChain });

    const result = await updateBroadcastProgress(db, 1, {
      matchedCount: 42,
      status: "queued",
    });

    expect(result).toEqual(row);
    expect(updateChain.set).toHaveBeenCalledWith({
      matchedCount: 42,
      status: "queued",
    });
  });

  it("updates status alone (e.g. marking failed)", async () => {
    const updateChain = makeUpdateChain([{ id: 1, status: "failed" }]);
    const db = makeMockDb({ updateChain });

    await updateBroadcastProgress(db, 1, { status: "failed" });

    expect(updateChain.set).toHaveBeenCalledWith({ status: "failed" });
  });
});
