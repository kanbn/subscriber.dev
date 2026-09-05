import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as analyticsRepo from "@subscriber.dev/db/repository/analytics.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { AnalyticsService } from "../analytics.service.js";

vi.mock("@subscriber.dev/db/repository/analytics.repo", () => ({
  getEnvironmentStepCounts: vi.fn(),
  getEnvironmentBounceBreakdown: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberCounts: vi.fn(),
  getOptedOutCounts: vi.fn(),
}));

const mockDb = {} as dbClient;

let service: AnalyticsService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new AnalyticsService();
  vi.mocked(subscriberRepo.getSubscriberCounts).mockResolvedValue({
    total: 100,
    newInPeriod: 10,
  });
  vi.mocked(subscriberRepo.getOptedOutCounts).mockResolvedValue({
    total: 8,
    recent: 2,
  });
  vi.mocked(analyticsRepo.getEnvironmentStepCounts).mockResolvedValue({
    pending: 3,
    sent: 90,
    skipped: 1,
    failed: 6,
    cancelled: 0,
    bounced: 4,
  });
  vi.mocked(analyticsRepo.getEnvironmentBounceBreakdown).mockResolvedValue({
    hard: 3,
    soft: 1,
  });
});

describe("getAnalytics", () => {
  it("assembles subscriber, send, and bounce stats into one response", async () => {
    const result = await service.getAnalytics(mockDb, 10, 30);

    expect(result).toEqual({
      days: 30,
      subscribers: {
        total: 100,
        newInPeriod: 10,
        optedOut: 8,
        optedOutInPeriod: 2,
      },
      sends: {
        sent: 90,
        failed: 6,
        skipped: 1,
        pending: 3,
        bounced: 4,
        successRate: 90 / 96,
      },
      bounces: { hard: 3, soft: 1 },
    });
  });

  it("passes a sinceDate roughly `days` ago to the period-scoped repo calls", async () => {
    const before = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await service.getAnalytics(mockDb, 10, 30);
    const after = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [, , sinceDateArg] = vi.mocked(subscriberRepo.getSubscriberCounts)
      .mock.calls[0]!;
    expect((sinceDateArg as Date).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect((sinceDateArg as Date).getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("returns a null successRate when there have been no sends or failures yet", async () => {
    vi.mocked(analyticsRepo.getEnvironmentStepCounts).mockResolvedValue({
      pending: 5,
      sent: 0,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      bounced: 0,
    });

    const result = await service.getAnalytics(mockDb, 10, 30);

    expect(result.sends.successRate).toBeNull();
  });

  it("gives a successRate of 1 when everything attempted has sent successfully", async () => {
    vi.mocked(analyticsRepo.getEnvironmentStepCounts).mockResolvedValue({
      pending: 0,
      sent: 50,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      bounced: 0,
    });

    const result = await service.getAnalytics(mockDb, 10, 30);

    expect(result.sends.successRate).toBe(1);
  });
});
