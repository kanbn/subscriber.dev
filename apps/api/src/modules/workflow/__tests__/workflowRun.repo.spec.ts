import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  cancelPendingForSubscriber,
  completeRunIfAllStepsTerminal,
  createRunWithSteps,
  getRunStepByProviderMessageId,
  listRunsForEnvironment,
  listRunsForWorkflow,
  updateRunStepStatus,
} from "@subscriber.dev/db/repository/workflowRun.repo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpdateChain(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function makeMockDb(
  overrides: Partial<{
    findMany: ReturnType<typeof vi.fn>;
    insertChain: { values: ReturnType<typeof vi.fn> };
    updateChain: ReturnType<typeof makeUpdateChain>;
  }> = {},
) {
  const findMany = overrides.findMany ?? vi.fn();
  const insertChain = overrides.insertChain ?? {
    values: vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  };
  const updateChain = overrides.updateChain ?? makeUpdateChain([]);

  const db = {
    query: {
      workflowRuns: { findFirst: vi.fn(), findMany },
      workflowRunSteps: { findFirst: vi.fn(), findMany },
    },
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    transaction: vi.fn(async (cb: (tx: dbClient) => unknown) =>
      cb(db as unknown as dbClient),
    ),
  };

  return db as unknown as dbClient;
}

// ---------------------------------------------------------------------------
// createRunWithSteps
// ---------------------------------------------------------------------------

describe("createRunWithSteps", () => {
  it("creates the run then its run-steps inside a transaction", async () => {
    const run = { id: 5, publicId: "run_abc" };
    const runSteps = [{ id: 10, stepOrder: 0 }];

    let call = 0;
    const insertChain = {
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockResolvedValue(call++ === 0 ? [run] : runSteps),
      })),
    };
    const db = makeMockDb({ insertChain });

    const result = await createRunWithSteps(db, {
      workflowId: 1,
      environmentId: 10,
      subscriberId: 100,
      payload: null,
      createdBy: 1,
      steps: [
        {
          stepId: 1,
          stepOrder: 0,
          type: "email",
          configSnapshot: { subject: "a", body: "a" },
          scheduledAt: new Date(),
        },
      ],
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ run, runSteps });
  });

  it("throws if the run insert returns nothing", async () => {
    const insertChain = {
      values: vi
        .fn()
        .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    };
    const db = makeMockDb({ insertChain });

    await expect(
      createRunWithSteps(db, {
        workflowId: 1,
        environmentId: 10,
        subscriberId: 100,
        payload: null,
        createdBy: 1,
        steps: [],
      }),
    ).rejects.toThrow("Failed to create workflow run");
  });
});

// ---------------------------------------------------------------------------
// updateRunStepStatus
// ---------------------------------------------------------------------------

describe("updateRunStepStatus", () => {
  it("marks a run-step as sent and stamps sentAt", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await updateRunStepStatus(db, 1, "sent");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", sentAt: expect.any(Date) }),
    );
  });

  it("marks a run-step as skipped with a reason", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await updateRunStepStatus(db, 1, "skipped", "opted out");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", errorMessage: "opted out" }),
    );
  });

  it("marks a run-step as failed with an error message", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await updateRunStepStatus(db, 1, "failed", "SMTP error");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorMessage: "SMTP error" }),
    );
  });

  it("does not stamp sentAt for non-sent statuses", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await updateRunStepStatus(db, 1, "failed", "SMTP error");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ sentAt: undefined }),
    );
  });
});

// ---------------------------------------------------------------------------
// cancelPendingForSubscriber
// ---------------------------------------------------------------------------

describe("cancelPendingForSubscriber", () => {
  it("still closes out active runs even with an empty run-step id list", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await cancelPendingForSubscriber(db, 100, [], "opted out");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        completedAt: expect.any(Date),
      }),
    );
  });

  it("marks the given run-steps cancelled and closes out the subscriber's active runs", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({ updateChain });
    await cancelPendingForSubscriber(db, 100, [1, 2], "opted out");

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        errorMessage: "opted out",
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        completedAt: expect.any(Date),
      }),
    );
    expect(db.update).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// completeRunIfAllStepsTerminal
// ---------------------------------------------------------------------------

describe("completeRunIfAllStepsTerminal", () => {
  it("marks the run completed when every step is terminal", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({
      findMany: vi
        .fn()
        .mockResolvedValue([{ status: "sent" }, { status: "skipped" }]),
      updateChain,
    });

    await completeRunIfAllStepsTerminal(db, 5);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("leaves the run alone when a step is still pending", async () => {
    const updateChain = makeUpdateChain([]);
    const db = makeMockDb({
      findMany: vi
        .fn()
        .mockResolvedValue([{ status: "sent" }, { status: "pending" }]),
      updateChain,
    });

    await completeRunIfAllStepsTerminal(db, 5);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getRunStepByProviderMessageId
// ---------------------------------------------------------------------------

describe("getRunStepByProviderMessageId", () => {
  it("returns the matching run step", async () => {
    const runStep = { id: 4, providerMessageId: "<abc@mail.kan.bn>" };
    const findFirst = vi.fn().mockResolvedValue(runStep);
    const db = {
      query: { workflowRunSteps: { findFirst } },
    } as unknown as dbClient;

    const result = await getRunStepByProviderMessageId(db, "<abc@mail.kan.bn>");

    expect(result).toEqual(runStep);
  });

  it("returns undefined when nothing matches", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: { workflowRunSteps: { findFirst } },
    } as unknown as dbClient;

    const result = await getRunStepByProviderMessageId(db, "<missing>");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listRunsForWorkflow
// ---------------------------------------------------------------------------

describe("listRunsForWorkflow", () => {
  it("includes the subscriber and steps relations", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ findMany });

    await listRunsForWorkflow(db, 1, { limit: 20, offset: 0 });

    const [opts] = findMany.mock.calls[0];
    expect(opts.with).toEqual({ steps: true, subscriber: true });
  });
});

// ---------------------------------------------------------------------------
// listRunsForEnvironment
// ---------------------------------------------------------------------------

describe("listRunsForEnvironment", () => {
  it("includes the subscriber, steps, and workflow relations", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ findMany });

    await listRunsForEnvironment(db, 1, { limit: 20, offset: 0 });

    const [opts] = findMany.mock.calls[0];
    expect(opts.with).toEqual({
      steps: true,
      subscriber: true,
      workflow: true,
    });
  });
});
