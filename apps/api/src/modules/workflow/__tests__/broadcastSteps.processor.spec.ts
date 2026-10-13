import { DelayedError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { BillingService } from "../../billing/billing.service.js";
import { BroadcastStepsProcessor } from "../broadcastSteps.processor.js";
import {
  handleRunStepJobFailed,
  processRunStepJob,
} from "../processRunStep.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  getBroadcastSendState: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  getRunStepById: vi.fn(),
  updateRunStepStatus: vi.fn(),
  completeRunIfAllStepsTerminal: vi.fn(),
}));

vi.mock("../processRunStep.js", () => ({
  processRunStepJob: vi.fn(),
  handleRunStepJobFailed: vi.fn(),
}));

let processor: BroadcastStepsProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new BroadcastStepsProcessor({
    skipSendReason: () => Promise.resolve(null),
    showsPoweredBy: () => Promise.resolve(false),
  } as unknown as BillingService);
});

describe("process", () => {
  it("delegates to processRunStepJob with the run-step id", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastSendState).mockResolvedValue({
      state: "send",
      scheduledAt: new Date(0),
    });

    await processor.process({ data: { runStepId: 42 } } as any);

    expect(processRunStepJob).toHaveBeenCalledWith(
      {},
      42,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("re-delays the job without sending while the broadcast is paused", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastSendState).mockResolvedValue({
      state: "hold",
      scheduledAt: new Date(0),
    });
    const job = {
      data: { runStepId: 42 },
      updateData: vi.fn(),
      moveToDelayed: vi.fn(),
    } as any;

    await expect(processor.process(job, "token-1")).rejects.toBeInstanceOf(
      DelayedError,
    );

    expect(job.updateData).toHaveBeenCalledWith({
      runStepId: 42,
      parked: true,
    });
    expect(job.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      "token-1",
    );
    const parkedFor = job.moveToDelayed.mock.calls[0][0] - Date.now();
    expect(parkedFor).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(parkedFor).toBeLessThanOrEqual(30 * 60 * 60 * 1000);
    expect(processRunStepJob).not.toHaveBeenCalled();
  });

  it("cancels a still-pending step without sending once the broadcast is cancelled", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastSendState).mockResolvedValue({
      state: "cancel",
      scheduledAt: new Date(0),
    });
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      id: 42,
      runId: 7,
      status: "pending",
    } as any);

    await processor.process({ data: { runStepId: 42 } } as any);

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      {},
      42,
      "cancelled",
      "Broadcast cancelled",
    );
    expect(workflowRunRepo.completeRunIfAllStepsTerminal).toHaveBeenCalledWith(
      {},
      7,
      "cancelled",
    );
    expect(processRunStepJob).not.toHaveBeenCalled();
  });
});

describe("process before the scheduled time", () => {
  it("waits until the stored schedule instead of sending early", async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
    vi.mocked(workflowBroadcastRepo.getBroadcastSendState).mockResolvedValue({
      state: "send",
      scheduledAt,
    });
    const job = { data: { runStepId: 42 }, moveToDelayed: vi.fn() } as any;

    await expect(processor.process(job, "token-1")).rejects.toBeInstanceOf(
      DelayedError,
    );

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      scheduledAt.getTime(),
      "token-1",
    );
    expect(processRunStepJob).not.toHaveBeenCalled();
  });

  it("sends when it's due, allowing for small clock differences", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastSendState).mockResolvedValue({
      state: "send",
      scheduledAt: new Date(Date.now() + 500),
    });

    await processor.process({ data: { runStepId: 42 } } as any);

    expect(processRunStepJob).toHaveBeenCalledWith(
      {},
      42,
      expect.any(Function),
      expect.any(Function),
    );
  });
});

describe("onFailed", () => {
  it("delegates to handleRunStepJobFailed", async () => {
    const job = { id: "job-1", data: { runStepId: 42 } } as any;
    const error = new Error("boom");

    await processor.onFailed(job, error);

    expect(handleRunStepJobFailed).toHaveBeenCalledWith(
      {},
      job,
      error,
      expect.objectContaining({ error: expect.any(Function) }),
    );
  });

  it("does nothing when the job has no id", async () => {
    await processor.onFailed(undefined, new Error("boom"));

    expect(handleRunStepJobFailed).not.toHaveBeenCalled();
  });
});
