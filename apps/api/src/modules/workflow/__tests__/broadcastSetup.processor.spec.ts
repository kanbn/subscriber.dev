import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";

import { BroadcastSetupProcessor } from "../broadcastSetup.processor.js";
import { createRunForSubscriber } from "../createRunForSubscriber.js";

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
}));

vi.mock("../createRunForSubscriber.js", () => ({
  createRunForSubscriber: vi.fn(),
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
});
