import { beforeEach, describe, expect, it, vi } from "vitest";

import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import { resolveAudienceSubscriberIds } from "../audienceQuery.js";
import {
  BroadcastDispatchProcessor,
  sendWindowOffsetMs,
} from "../broadcastDispatch.processor.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  getBroadcastById: vi.fn(),
  updateBroadcastProgress: vi.fn(),
  markBroadcastDispatched: vi.fn(),
  markBroadcastFailed: vi.fn(),
}));

vi.mock("../audienceQuery.js", () => ({
  resolveAudienceSubscriberIds: vi.fn(),
}));

const mockSetupQueue = { addBulk: vi.fn() };

let processor: BroadcastDispatchProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new BroadcastDispatchProcessor(mockSetupQueue as any);
});

function makeJob(broadcastId = 1) {
  return {
    data: { broadcastId },
    id: "job-1",
    attemptsMade: 1,
    opts: { attempts: 3 },
  } as any;
}

describe("process", () => {
  it("is a no-op when the broadcast no longer exists", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      undefined,
    );

    await processor.process(makeJob());

    expect(resolveAudienceSubscriberIds).not.toHaveBeenCalled();
    expect(mockSetupQueue.addBulk).not.toHaveBeenCalled();
  });

  it("resolves the audience, bulk-enqueues one deterministic setup job per subscriber, and records progress", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue({
      id: 1,
      environmentId: 10,
      audienceQuery: { type: "optedIn" },
    } as any);
    vi.mocked(resolveAudienceSubscriberIds).mockResolvedValue([100, 101, 102]);

    await processor.process(makeJob());

    expect(resolveAudienceSubscriberIds).toHaveBeenCalledWith({}, 10, {
      type: "optedIn",
    });

    expect(mockSetupQueue.addBulk).toHaveBeenCalledTimes(1);
    const [jobs] = mockSetupQueue.addBulk.mock.calls[0]!;
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        name: "setup-subscriber",
        data: { broadcastId: 1, subscriberId: 100, startDelayMs: 0 },
        opts: expect.objectContaining({
          jobId: "broadcast-1-subscriber-100",
          attempts: 3,
        }),
      }),
    );

    expect(workflowBroadcastRepo.markBroadcastDispatched).toHaveBeenCalledWith(
      {},
      1,
      3,
    );
  });

  it("chunks addBulk calls for very large audiences", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue({
      id: 1,
      environmentId: 10,
      audienceQuery: { type: "optedIn" },
    } as any);
    const ids = Array.from({ length: 4500 }, (_, i) => i + 1);
    vi.mocked(resolveAudienceSubscriberIds).mockResolvedValue(ids);

    await processor.process(makeJob());

    // 2000 + 2000 + 500
    expect(mockSetupQueue.addBulk).toHaveBeenCalledTimes(3);
    expect(workflowBroadcastRepo.markBroadcastDispatched).toHaveBeenCalledWith(
      {},
      1,
      4500,
    );
  });

  it("spreads start delays evenly across the send window, including across chunks", async () => {
    const hourMs = 60 * 60 * 1000;
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue({
      id: 1,
      environmentId: 10,
      audienceQuery: { type: "optedIn" },
      sendOverMs: hourMs,
    } as any);
    const ids = Array.from({ length: 4000 }, (_, i) => i + 1);
    vi.mocked(resolveAudienceSubscriberIds).mockResolvedValue(ids);

    await processor.process(makeJob());

    const first = mockSetupQueue.addBulk.mock.calls[0]![0];
    const second = mockSetupQueue.addBulk.mock.calls[1]![0];
    expect(first[0].data.startDelayMs).toBe(0);
    // Subscriber 2000 of 4000 is halfway through the window.
    expect(second[0].data.startDelayMs).toBe(hourMs / 2);
    expect(second.at(-1).data.startDelayMs).toBeLessThan(hourMs);
  });

  it("does nothing for a broadcast cancelled before dispatch ran", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue({
      id: 1,
      environmentId: 10,
      status: "cancelled",
      audienceQuery: { type: "optedIn" },
    } as any);

    await processor.process(makeJob());

    expect(resolveAudienceSubscriberIds).not.toHaveBeenCalled();
    expect(mockSetupQueue.addBulk).not.toHaveBeenCalled();
  });
});

describe("sendWindowOffsetMs", () => {
  it("is zero with no window or a single subscriber", () => {
    expect(sendWindowOffsetMs(5, 10, null)).toBe(0);
    expect(sendWindowOffsetMs(0, 1, 1000)).toBe(0);
  });

  it("places subscriber i at i/n of the way through the window", () => {
    expect(sendWindowOffsetMs(0, 4, 1000)).toBe(0);
    expect(sendWindowOffsetMs(1, 4, 1000)).toBe(250);
    expect(sendWindowOffsetMs(3, 4, 1000)).toBe(750);
  });
});

describe("onFailed", () => {
  it("marks the broadcast failed once BullMQ has exhausted retries", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowBroadcastRepo.markBroadcastFailed).toHaveBeenCalledWith(
      {},
      1,
    );
  });

  it("does nothing while attempts remain", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 1, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowBroadcastRepo.markBroadcastFailed).not.toHaveBeenCalled();
  });
});
