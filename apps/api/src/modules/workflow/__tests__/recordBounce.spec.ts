import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import { recordBounce } from "../recordBounce.js";

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  getRunStepById: vi.fn(),
  getRunById: vi.fn(),
  markRunStepBounced: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  createSubscriberPreferences: vi.fn(),
}));

const mockDb = {} as any;
const mockRunStep = { id: 1, runId: 5 };
const mockRun = { id: 5, subscriberId: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
    mockRunStep as any,
  );
  vi.mocked(workflowRunRepo.getRunById).mockResolvedValue(mockRun as any);
});

describe("recordBounce", () => {
  it("marks the run step bounced with the given type and reason", async () => {
    await recordBounce(mockDb, {
      runStepId: 1,
      bounceType: "soft",
      reason: "mailbox full",
    });

    expect(workflowRunRepo.markRunStepBounced).toHaveBeenCalledWith(mockDb, 1, {
      bounceType: "soft",
      reason: "mailbox full",
    });
  });

  it("opts the subscriber out of email on a hard bounce", async () => {
    await recordBounce(mockDb, {
      runStepId: 1,
      bounceType: "hard",
      reason: "no such user",
    });

    expect(subscriberRepo.createSubscriberPreferences).toHaveBeenCalledWith(
      mockDb,
      { subscriberId: 100, email: false },
    );
  });

  it("does not touch subscriber preferences on a soft bounce", async () => {
    await recordBounce(mockDb, {
      runStepId: 1,
      bounceType: "soft",
      reason: "mailbox full",
    });

    expect(subscriberRepo.createSubscriberPreferences).not.toHaveBeenCalled();
  });

  it("is a no-op when the run step no longer exists", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(undefined);

    await recordBounce(mockDb, {
      runStepId: 999,
      bounceType: "hard",
      reason: "no such user",
    });

    expect(workflowRunRepo.markRunStepBounced).not.toHaveBeenCalled();
    expect(subscriberRepo.createSubscriberPreferences).not.toHaveBeenCalled();
  });
});
