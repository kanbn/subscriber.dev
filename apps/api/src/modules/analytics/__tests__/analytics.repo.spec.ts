import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  getEnvironmentBounceBreakdown,
  getEnvironmentStepCounts,
} from "@subscriber.dev/db/repository/analytics.repo";

function makeMockDb(groupByResult: () => unknown) {
  const groupBy = vi.fn().mockImplementation(() => groupByResult());
  const where = vi.fn().mockReturnValue({ groupBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });

  return {
    select: vi.fn().mockReturnValue({ from }),
  } as unknown as dbClient;
}

describe("getEnvironmentStepCounts", () => {
  it("returns zero counts when the environment has no run-steps yet", async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue([]));

    const result = await getEnvironmentStepCounts(db, 10);

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
    const db = makeMockDb(
      vi.fn().mockResolvedValue([
        { status: "sent", count: 100 },
        { status: "failed", count: 4 },
        { status: "bounced", count: 3 },
        { status: "pending", count: 7 },
      ]),
    );

    const result = await getEnvironmentStepCounts(db, 10);

    expect(result).toEqual({
      pending: 7,
      sent: 100,
      skipped: 0,
      failed: 4,
      cancelled: 0,
      bounced: 3,
    });
  });
});

describe("getEnvironmentBounceBreakdown", () => {
  it("returns zero counts when there are no bounces", async () => {
    const db = makeMockDb(vi.fn().mockResolvedValue([]));

    const result = await getEnvironmentBounceBreakdown(db, 10);

    expect(result).toEqual({ hard: 0, soft: 0 });
  });

  it("maps grouped counts per bounce type", async () => {
    const db = makeMockDb(
      vi.fn().mockResolvedValue([
        { bounceType: "hard", count: 5 },
        { bounceType: "soft", count: 2 },
      ]),
    );

    const result = await getEnvironmentBounceBreakdown(db, 10);

    expect(result).toEqual({ hard: 5, soft: 2 });
  });

  it("ignores rows with a null bounceType", async () => {
    const db = makeMockDb(
      vi.fn().mockResolvedValue([{ bounceType: null, count: 1 }]),
    );

    const result = await getEnvironmentBounceBreakdown(db, 10);

    expect(result).toEqual({ hard: 0, soft: 0 });
  });
});
