import { beforeEach, describe, expect, it, vi } from "vitest";

import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import { createRunForSubscriber } from "../createRunForSubscriber.js";

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  createRunWithSteps: vi.fn(),
  setRunStepBullJobId: vi.fn(),
}));

const mockQueue = { add: vi.fn() };

const steps = [
  { id: 1, stepOrder: 0, type: "email", delayMs: 0, config: {} },
  { id: 2, stepOrder: 1, type: "email", delayMs: 1_000, config: {} },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workflowRunRepo.createRunWithSteps).mockResolvedValue({
    run: { id: 7 },
    runSteps: [{ id: 11 }, { id: 12 }],
  } as any);
  mockQueue.add.mockResolvedValue({ id: "job" });
});

describe("createRunForSubscriber", () => {
  it("offsets every step's schedule and queue delay by startDelayMs", async () => {
    await createRunForSubscriber({} as any, mockQueue as any, {
      workflowId: 1,
      steps,
      environmentId: 10,
      subscriberId: 100,
      createdBy: 1,
      broadcastId: 5,
      startDelayMs: 60_000,
    });

    const delays = mockQueue.add.mock.calls.map((call) => call[2].delay);
    expect(delays).toEqual([60_000, 61_000]);

    const [, { steps: planned }] = vi.mocked(workflowRunRepo.createRunWithSteps)
      .mock.calls[0]!;
    const offsets = planned.map(
      (s) => s.scheduledAt.getTime() - planned[0]!.scheduledAt.getTime(),
    );
    expect(offsets).toEqual([0, 1_000]);
    expect(planned[0]!.scheduledAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 59_000,
    );
  });

  it("starts immediately without a start delay", async () => {
    await createRunForSubscriber({} as any, mockQueue as any, {
      workflowId: 1,
      steps,
      environmentId: 10,
      subscriberId: 100,
      createdBy: 1,
    });

    const delays = mockQueue.add.mock.calls.map((call) => call[2].delay);
    expect(delays).toEqual([0, 1_000]);
  });
});
