import { beforeEach, describe, expect, it, vi } from "vitest";

import { BroadcastStepsProcessor } from "../broadcastSteps.processor.js";
import {
  handleRunStepJobFailed,
  processRunStepJob,
} from "../processRunStep.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../processRunStep.js", () => ({
  processRunStepJob: vi.fn(),
  handleRunStepJobFailed: vi.fn(),
}));

let processor: BroadcastStepsProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new BroadcastStepsProcessor();
});

describe("process", () => {
  it("delegates to processRunStepJob with the run-step id", async () => {
    await processor.process({ data: { runStepId: 42 } } as any);

    expect(processRunStepJob).toHaveBeenCalledWith({}, 42);
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
