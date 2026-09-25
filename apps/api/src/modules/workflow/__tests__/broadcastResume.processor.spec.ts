import { beforeEach, describe, expect, it, vi } from "vitest";

import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import { BroadcastResumeProcessor } from "../broadcastResume.processor.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  listPendingStepsForBroadcast: vi.fn(),
}));

function makeSendJob(
  delayed: boolean,
  { parked = false, attemptsMade = 0 } = {},
) {
  return {
    data: { runStepId: 1, parked },
    attemptsMade,
    isDelayed: vi.fn().mockResolvedValue(delayed),
    changeDelay: vi.fn(),
    updateData: vi.fn(),
  };
}

const mockStepsQueue = { getJob: vi.fn() };

let processor: BroadcastResumeProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new BroadcastResumeProcessor(mockStepsQueue as any);
});

describe("process", () => {
  it("moves each delayed send job to its rescheduled time", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const future = makeSendJob(true);
    const overdue = makeSendJob(true, { parked: true, attemptsMade: 1 });
    vi.mocked(
      workflowBroadcastRepo.listPendingStepsForBroadcast,
    ).mockResolvedValue([
      {
        id: 1,
        bullJobId: "run-step-1",
        scheduledAt: new Date("2026-01-01T00:30:00Z"),
      },
      {
        id: 2,
        bullJobId: "run-step-2",
        scheduledAt: new Date("2025-12-31T23:00:00Z"),
      },
    ]);
    mockStepsQueue.getJob.mockImplementation(async (id: string) =>
      id === "run-step-1" ? future : overdue,
    );

    await processor.process({ data: { broadcastId: 5 } } as any);
    vi.useRealTimers();

    expect(future.changeDelay).toHaveBeenCalledWith(30 * 60 * 1000);
    expect(overdue.changeDelay).toHaveBeenCalledWith(0);
    expect(overdue.updateData).toHaveBeenCalledWith({
      runStepId: 1,
      parked: false,
    });
    expect(future.updateData).not.toHaveBeenCalled();
  });

  it("leaves a failed send in its retry backoff alone", async () => {
    const retrying = makeSendJob(true, { attemptsMade: 1 });
    vi.mocked(
      workflowBroadcastRepo.listPendingStepsForBroadcast,
    ).mockResolvedValue([
      { id: 1, bullJobId: "run-step-1", scheduledAt: new Date(0) },
    ]);
    mockStepsQueue.getJob.mockResolvedValue(retrying);

    await processor.process({ data: { broadcastId: 5 } } as any);

    expect(retrying.changeDelay).not.toHaveBeenCalled();
  });

  it("leaves jobs that aren't delayed, or are missing, alone", async () => {
    const waiting = makeSendJob(false);
    vi.mocked(
      workflowBroadcastRepo.listPendingStepsForBroadcast,
    ).mockResolvedValue([
      { id: 1, bullJobId: "run-step-1", scheduledAt: new Date() },
      { id: 2, bullJobId: "run-step-2", scheduledAt: new Date() },
      { id: 3, bullJobId: null, scheduledAt: new Date() },
    ]);
    mockStepsQueue.getJob.mockImplementation(async (id: string) =>
      id === "run-step-1" ? waiting : undefined,
    );

    await processor.process({ data: { broadcastId: 5 } } as any);

    expect(waiting.changeDelay).not.toHaveBeenCalled();
    expect(mockStepsQueue.getJob).toHaveBeenCalledTimes(2);
  });
});
