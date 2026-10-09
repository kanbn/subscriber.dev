import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  createBroadcast,
  getBroadcastBounceBreakdown,
  getBroadcastById,
  getBroadcastByPublicId,
  getBroadcastSendState,
  getBroadcastStepCounts,
  listBroadcastsForWorkflow,
  transitionBroadcastStatus,
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
    findFirst: () => unknown;
    findMany: () => unknown;
    insertChain: { values: () => unknown };
    updateChain: ReturnType<typeof makeUpdateChain>;
    groupByResult: () => unknown;
  }> = {},
) {
  const findFirst = overrides.findFirst ?? vi.fn();
  const findMany = overrides.findMany ?? vi.fn();
  const insertChain = overrides.insertChain ?? makeInsertChain([]);
  const updateChain = overrides.updateChain ?? makeUpdateChain([]);
  const groupByResult =
    overrides.groupByResult ?? vi.fn().mockResolvedValue([]);

  const groupBy = vi.fn().mockImplementation(() => groupByResult());
  const selectWhere = vi.fn().mockReturnValue({ groupBy });
  const innerJoin = vi.fn().mockReturnValue({ where: selectWhere });
  const from = vi.fn().mockReturnValue({ innerJoin });

  const db = {
    query: { workflowBroadcasts: { findFirst, findMany } },
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockReturnValue({ from }),
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

describe("getBroadcastByPublicId", () => {
  it("returns the broadcast scoped to the workflow", async () => {
    const row = { id: 1, workflowId: 5, publicId: "bc_abc" };
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(row) });

    const result = await getBroadcastByPublicId(db, 5, "bc_abc");
    expect(result).toEqual(row);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(undefined) });

    const result = await getBroadcastByPublicId(db, 5, "bc_missing");
    expect(result).toBeUndefined();
  });
});

describe("listBroadcastsForWorkflow", () => {
  it("returns every broadcast for the workflow", async () => {
    const rows = [{ id: 1, publicId: "bc_abc" }];
    const db = makeMockDb({ findMany: vi.fn().mockResolvedValue(rows) });

    const result = await listBroadcastsForWorkflow(db, 5, {
      limit: 20,
      offset: 0,
    });
    expect(result).toEqual(rows);
  });
});

describe("getBroadcastStepCounts", () => {
  it("returns zero counts when the broadcast has no run-steps yet", async () => {
    const db = makeMockDb({ groupByResult: vi.fn().mockResolvedValue([]) });

    const result = await getBroadcastStepCounts(db, 1);

    expect(result).toEqual({
      pending: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      bounced: 0,
    });
  });

  it("maps grouped counts per status", async () => {
    const db = makeMockDb({
      groupByResult: vi.fn().mockResolvedValue([
        { status: "sent", count: 8 },
        { status: "failed", count: 1 },
        { status: "pending", count: 3 },
      ]),
    });

    const result = await getBroadcastStepCounts(db, 1);

    expect(result).toEqual({
      pending: 3,
      sent: 8,
      skipped: 0,
      failed: 1,
      cancelled: 0,
      bounced: 0,
    });
  });
});

describe("getBroadcastBounceBreakdown", () => {
  it("returns zero counts when there are no bounces", async () => {
    const db = makeMockDb({ groupByResult: vi.fn().mockResolvedValue([]) });

    const result = await getBroadcastBounceBreakdown(db, 1);

    expect(result).toEqual({ hard: 0, soft: 0 });
  });

  it("maps grouped counts per bounce type", async () => {
    const db = makeMockDb({
      groupByResult: vi.fn().mockResolvedValue([
        { bounceType: "hard", count: 2 },
        { bounceType: "soft", count: 4 },
      ]),
    });

    const result = await getBroadcastBounceBreakdown(db, 1);

    expect(result).toEqual({ hard: 2, soft: 4 });
  });

  it("ignores rows with a null bounceType", async () => {
    const db = makeMockDb({
      groupByResult: vi
        .fn()
        .mockResolvedValue([{ bounceType: null, count: 1 }]),
    });

    const result = await getBroadcastBounceBreakdown(db, 1);

    expect(result).toEqual({ hard: 0, soft: 0 });
  });
});

describe("getBroadcastSendState", () => {
  function dbReturning(rows: unknown[]) {
    const where = vi.fn().mockResolvedValue(rows);
    const join2 = vi.fn().mockReturnValue({ where });
    const join1 = vi.fn().mockReturnValue({ innerJoin: join2 });
    const from = vi.fn().mockReturnValue({ innerJoin: join1 });
    return { select: vi.fn().mockReturnValue({ from }) } as unknown as dbClient;
  }

  it.each([
    ["pending", "send"],
    ["queued", "send"],
    ["paused", "hold"],
    ["cancelled", "cancel"],
    ["failed", "cancel"],
  ])("maps a %s broadcast to %s", async (status, expected) => {
    const scheduledAt = new Date(0);
    expect(
      await getBroadcastSendState(dbReturning([{ status, scheduledAt }]), 1),
    ).toEqual({ state: expected, scheduledAt });
  });

  it("is undefined for a step that isn't part of a broadcast", async () => {
    expect(await getBroadcastSendState(dbReturning([]), 1)).toBeUndefined();
  });
});

describe("transitionBroadcastStatus", () => {
  it("returns undefined when the broadcast wasn't in an allowed status", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });

    const result = await transitionBroadcastStatus(
      db,
      1,
      ["pending", "queued"],
      "paused",
    );

    expect(result).toBeUndefined();
    expect(updateChain.set).toHaveBeenCalledWith({ status: "paused" });
  });
});
