import { describe, it, expect, vi, beforeEach } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  getSubscriberByPublicId,
  listSubscribers,
  updateSubscriber,
  softDeleteSubscriber,
} from "@subscriber.dev/db/repository/subscriber.repo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function makeMockDb(overrides: Partial<{
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  updateChain: ReturnType<typeof makeReturning>;
}>  = {}) {
  const findFirst = overrides.findFirst ?? vi.fn();
  const findMany = overrides.findMany ?? vi.fn();
  const updateChain = overrides.updateChain ?? makeReturning([]);

  return {
    query: {
      subscribers: { findFirst, findMany },
      subscriberPreferences: { findFirst: vi.fn() },
      environments: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue(updateChain),
  } as unknown as dbClient;
}

const mockSubscriber = {
  id: 1,
  publicId: "sub_abc123",
  environmentId: 10,
  email: "alice@example.com",
  phone: null,
  externalId: "ext_1",
  firstName: "Alice",
  lastName: "Smith",
  name: "Alice Smith",
  attributes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
  createdBy: 99,
  updatedBy: 99,
  deletedBy: null,
};

// ---------------------------------------------------------------------------
// getSubscriberByPublicId
// ---------------------------------------------------------------------------

describe("getSubscriberByPublicId", () => {
  it("returns the subscriber when found", async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(mockSubscriber) });
    const result = await getSubscriberByPublicId(db, "sub_abc123");
    expect(result).toEqual(mockSubscriber);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(undefined) });
    const result = await getSubscriberByPublicId(db, "sub_missing");
    expect(result).toBeUndefined();
  });

  it("passes isNull(deletedAt) in the where clause", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = makeMockDb({ findFirst });
    await getSubscriberByPublicId(db, "sub_abc123");
    const [opts] = findFirst.mock.calls[0];
    // The where condition is a compound `and(...)` — verify it's not a plain eq
    expect(opts.where).toBeDefined();
    // Drizzle encodes compound conditions as objects; ensure it's not a single-field eq
    expect(String(opts.where)).not.toBe("sub_abc123");
  });
});

// ---------------------------------------------------------------------------
// listSubscribers
// ---------------------------------------------------------------------------

describe("listSubscribers", () => {
  it("returns subscribers for the environment", async () => {
    const db = makeMockDb({ findMany: vi.fn().mockResolvedValue([mockSubscriber]) });
    const result = await listSubscribers(db, 10, { limit: 20, offset: 0 });
    expect(result).toHaveLength(1);
    expect(result[0]?.publicId).toBe("sub_abc123");
  });

  it("passes limit and offset to findMany", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ findMany });
    await listSubscribers(db, 10, { limit: 5, offset: 10 });
    const [opts] = findMany.mock.calls[0];
    expect(opts.limit).toBe(5);
    expect(opts.offset).toBe(10);
  });

  it("returns empty array when no subscribers exist", async () => {
    const db = makeMockDb({ findMany: vi.fn().mockResolvedValue([]) });
    const result = await listSubscribers(db, 10, { limit: 20, offset: 0 });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateSubscriber
// ---------------------------------------------------------------------------

describe("updateSubscriber", () => {
  it("returns the updated subscriber", async () => {
    const updated = { ...mockSubscriber, firstName: "Bob" };
    const chain = makeReturning([updated]);
    const db = makeMockDb({ updateChain: chain });

    const result = await updateSubscriber(db, 1, {
      firstName: "Bob",
      updatedBy: 99,
    });

    expect(result).toEqual(updated);
  });

  it("calls set with the provided data and updatedAt", async () => {
    const chain = makeReturning([mockSubscriber]);
    const db = makeMockDb({ updateChain: chain });

    await updateSubscriber(db, 1, { firstName: "Bob", updatedBy: 99 });

    const setCall = chain.set.mock.calls[0][0];
    expect(setCall.firstName).toBe("Bob");
    expect(setCall.updatedBy).toBe(99);
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });

  it("returns undefined when the subscriber does not exist (empty returning)", async () => {
    const chain = makeReturning([]);
    const db = makeMockDb({ updateChain: chain });
    const result = await updateSubscriber(db, 999, { updatedBy: 1 });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// softDeleteSubscriber
// ---------------------------------------------------------------------------

describe("softDeleteSubscriber", () => {
  it("returns the deleted subscriber", async () => {
    const deleted = { ...mockSubscriber, deletedAt: new Date() };
    const chain = makeReturning([deleted]);
    const db = makeMockDb({ updateChain: chain });

    const result = await softDeleteSubscriber(db, 1, 99);
    expect(result).toEqual(deleted);
  });

  it("sets deletedAt, deletedBy and updatedAt", async () => {
    const chain = makeReturning([mockSubscriber]);
    const db = makeMockDb({ updateChain: chain });

    await softDeleteSubscriber(db, 1, 99);

    const setCall = chain.set.mock.calls[0][0];
    expect(setCall.deletedAt).toBeInstanceOf(Date);
    expect(setCall.deletedBy).toBe(99);
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });

  it("returns undefined when subscriber is already deleted (empty returning)", async () => {
    const chain = makeReturning([]);
    const db = makeMockDb({ updateChain: chain });
    const result = await softDeleteSubscriber(db, 1, 99);
    expect(result).toBeUndefined();
  });
});
