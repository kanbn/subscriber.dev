import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import { BroadcastSetupProcessor } from "../broadcastSetup.processor.js";
import {
  createRunForSubscriber,
  queueRunSteps,
} from "../createRunForSubscriber.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberById: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflow.repo", () => ({
  getWorkflowById: vi.fn(),
  listStepsForWorkflow: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  getBroadcastById: vi.fn(),
  getRunForSubscriber: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  listUnqueuedPendingSteps: vi.fn(),
}));

vi.mock("../createRunForSubscriber.js", () => ({
  createRunForSubscriber: vi.fn(),
  queueRunSteps: vi.fn(),
}));

const mockStepsQueue = { add: vi.fn() };

let processor: BroadcastSetupProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new BroadcastSetupProcessor(mockStepsQueue as any);
});

function makeJob(broadcastId = 1, subscriberId = 100) {
  return { data: { broadcastId, subscriberId } } as any;
}

const mockBroadcast = {
  id: 1,
  workflowId: 5,
  environmentId: 10,
  createdBy: 1,
};
const mockSubscriber = { id: 100 };
const mockWorkflow = { id: 5 };
const mockSteps = [
  { id: 1, stepOrder: 0, type: "email", delayMs: 0, config: {} },
];

describe("process", () => {
  it("creates the run for the subscriber via the shared createRunForSubscriber, with broadcastId set", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      mockBroadcast as any,
    );
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(workflowRepo.getWorkflowById).mockResolvedValue(
      mockWorkflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      mockSteps as any,
    );

    await processor.process(makeJob());

    expect(createRunForSubscriber).toHaveBeenCalledWith({}, mockStepsQueue, {
      workflowId: 5,
      steps: mockSteps,
      environmentId: 10,
      subscriberId: 100,
      payload: null,
      createdBy: 1,
      broadcastId: 1,
    });
  });

  it("passes the subscriber's send-window offset through as the run's start delay", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      mockBroadcast as any,
    );
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(workflowRepo.getWorkflowById).mockResolvedValue(
      mockWorkflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      mockSteps as any,
    );

    await processor.process({
      data: { broadcastId: 1, subscriberId: 100, startDelayMs: 90_000 },
    } as any);

    expect(createRunForSubscriber).toHaveBeenCalledWith(
      {},
      mockStepsQueue,
      expect.objectContaining({ startDelayMs: 90_000 }),
    );
  });

  it.each(["cancelled", "failed"])(
    "skips subscribers once the broadcast is %s",
    async (status) => {
      vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue({
        ...mockBroadcast,
        status,
      } as any);

      await processor.process(makeJob());

      expect(subscriberRepo.getSubscriberById).not.toHaveBeenCalled();
      expect(createRunForSubscriber).not.toHaveBeenCalled();
    },
  );

  it("is a no-op when the broadcast no longer exists", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      undefined,
    );

    await processor.process(makeJob());

    expect(createRunForSubscriber).not.toHaveBeenCalled();
  });

  it("is a no-op when the subscriber no longer exists", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      mockBroadcast as any,
    );
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(undefined);

    await processor.process(makeJob());

    expect(createRunForSubscriber).not.toHaveBeenCalled();
  });

  it("is a no-op when the workflow no longer exists", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      mockBroadcast as any,
    );
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(workflowRepo.getWorkflowById).mockResolvedValue(undefined);

    await processor.process(makeJob());

    expect(createRunForSubscriber).not.toHaveBeenCalled();
  });

  it("is a no-op when the workflow has no steps", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
      mockBroadcast as any,
    );
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(workflowRepo.getWorkflowById).mockResolvedValue(
      mockWorkflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);

    await processor.process(makeJob());

    expect(createRunForSubscriber).not.toHaveBeenCalled();
  });

  describe("when setup runs again (retry or re-dispatch)", () => {
    beforeEach(() => {
      vi.mocked(workflowBroadcastRepo.getBroadcastById).mockResolvedValue(
        mockBroadcast as any,
      );
      vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
        mockSubscriber as any,
      );
      vi.mocked(workflowRepo.getWorkflowById).mockResolvedValue(
        mockWorkflow as any,
      );
      vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
        mockSteps as any,
      );
    });

    it("doesn't create a second run, but queues any of the existing run's steps that were never queued", async () => {
      const stranded = [{ id: 11, scheduledAt: new Date() }];
      vi.mocked(workflowBroadcastRepo.getRunForSubscriber).mockResolvedValue({
        id: 7,
      });
      vi.mocked(workflowRunRepo.listUnqueuedPendingSteps).mockResolvedValue(
        stranded,
      );

      await processor.process(makeJob());

      expect(createRunForSubscriber).not.toHaveBeenCalled();
      expect(workflowRunRepo.listUnqueuedPendingSteps).toHaveBeenCalledWith(
        {},
        7,
      );
      expect(queueRunSteps).toHaveBeenCalledWith({}, mockStepsQueue, stranded);
    });

    it("recovers the winner's run when a racing setup hits the unique constraint", async () => {
      vi.mocked(workflowBroadcastRepo.getRunForSubscriber)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 7 });
      vi.mocked(workflowRunRepo.listUnqueuedPendingSteps).mockResolvedValue([]);
      vi.mocked(createRunForSubscriber).mockRejectedValue(
        Object.assign(new Error("Failed query"), {
          cause: { code: "23505" },
        }),
      );

      await expect(processor.process(makeJob())).resolves.toBeUndefined();
      expect(workflowRunRepo.listUnqueuedPendingSteps).toHaveBeenCalledWith(
        {},
        7,
      );
    });

    it("rethrows a unique-constraint clash when no existing run is found", async () => {
      vi.mocked(workflowBroadcastRepo.getRunForSubscriber).mockResolvedValue(
        undefined,
      );
      const clash = Object.assign(new Error("Failed query"), {
        cause: { code: "23505" },
      });
      vi.mocked(createRunForSubscriber).mockRejectedValue(clash);

      await expect(processor.process(makeJob())).rejects.toBe(clash);
    });

    it("still throws other errors so BullMQ retries", async () => {
      vi.mocked(workflowBroadcastRepo.getRunForSubscriber).mockResolvedValue(
        undefined,
      );
      vi.mocked(createRunForSubscriber).mockRejectedValue(
        new Error("sorry, too many clients already"),
      );

      await expect(processor.process(makeJob())).rejects.toThrow(
        "too many clients",
      );
    });
  });
});
