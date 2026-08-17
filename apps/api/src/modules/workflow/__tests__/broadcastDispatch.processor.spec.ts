import { beforeEach, describe, expect, it, vi } from "vitest";

import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import { resolveAudienceSubscriberIds } from "../audienceQuery.js";
import { BroadcastDispatchProcessor } from "../broadcastDispatch.processor.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  getBroadcastById: vi.fn(),
  updateBroadcastProgress: vi.fn(),
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
        data: { broadcastId: 1, subscriberId: 100 },
        opts: expect.objectContaining({
          jobId: "broadcast-1-subscriber-100",
          attempts: 3,
        }),
      }),
    );

    expect(workflowBroadcastRepo.updateBroadcastProgress).toHaveBeenCalledWith(
      {},
      1,
      { matchedCount: 3, status: "queued" },
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
    expect(workflowBroadcastRepo.updateBroadcastProgress).toHaveBeenCalledWith(
      {},
      1,
      { matchedCount: 4500, status: "queued" },
    );
  });
});

describe("onFailed", () => {
  it("marks the broadcast failed once BullMQ has exhausted retries", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowBroadcastRepo.updateBroadcastProgress).toHaveBeenCalledWith(
      {},
      1,
      { status: "failed" },
    );
  });

  it("does nothing while attempts remain", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 1, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(
      workflowBroadcastRepo.updateBroadcastProgress,
    ).not.toHaveBeenCalled();
  });
});
