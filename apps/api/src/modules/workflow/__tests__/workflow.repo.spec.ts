import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import {
  createWorkflow,
  getWorkflowByKey,
  replaceWorkflowSteps,
  softDeleteWorkflow,
  updateWorkflow,
} from "@subscriber.dev/db/repository/workflow.repo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInsertChain(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function makeUpdateChain(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function makeDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  return { where };
}

function makeMockDb(
  overrides: Partial<{
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    insertChain: { values: ReturnType<typeof vi.fn> };
    updateChain: ReturnType<typeof makeUpdateChain>;
    deleteChain: ReturnType<typeof makeDeleteChain>;
  }> = {},
) {
  const findFirst = overrides.findFirst ?? vi.fn();
  const findMany = overrides.findMany ?? vi.fn();
  const insertChain = overrides.insertChain ?? makeInsertChain([]);
  const updateChain = overrides.updateChain ?? makeUpdateChain([]);
  const deleteChain = overrides.deleteChain ?? makeDeleteChain();

  const db = {
    query: {
      workflows: { findFirst, findMany },
      workflowSteps: { findFirst, findMany },
    },
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    transaction: vi.fn(async (cb: (tx: dbClient) => unknown) =>
      cb(db as unknown as dbClient),
    ),
  };

  return db as unknown as dbClient;
}

// ---------------------------------------------------------------------------
// getWorkflowByKey
// ---------------------------------------------------------------------------

describe("getWorkflowByKey", () => {
  it("returns the workflow when found", async () => {
    const workflow = { id: 1, key: "user-signup" };
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(workflow) });
    const result = await getWorkflowByKey(db, 10, "user-signup");
    expect(result).toEqual(workflow);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockDb({ findFirst: vi.fn().mockResolvedValue(undefined) });
    const result = await getWorkflowByKey(db, 10, "missing");
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe("createWorkflow", () => {
  it("creates the workflow then its steps inside a transaction", async () => {
    const workflow = { id: 1, key: "user-signup" };
    const steps = [{ id: 1, stepOrder: 0 }];

    let call = 0;
    const insertChain = {
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockResolvedValue(call++ === 0 ? [workflow] : steps),
      })),
    };
    const db = makeMockDb({ insertChain });

    const result = await createWorkflow(db, {
      environmentId: 10,
      key: "user-signup",
      name: "Signup sequence",
      steps: [
        { type: "email", delayMs: 0, config: { subject: "hi", body: "hi" } },
      ],
      createdBy: 1,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ workflow, steps });
  });

  it("throws if the workflow insert returns nothing", async () => {
    const insertChain = {
      values: vi
        .fn()
        .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    };
    const db = makeMockDb({ insertChain });

    await expect(
      createWorkflow(db, {
        environmentId: 10,
        key: "user-signup",
        name: "Signup sequence",
        steps: [],
        createdBy: 1,
      }),
    ).rejects.toThrow("Failed to create workflow");
  });
});

// ---------------------------------------------------------------------------
// replaceWorkflowSteps
// ---------------------------------------------------------------------------

describe("replaceWorkflowSteps", () => {
  it("deletes existing steps then inserts the new ones inside a transaction", async () => {
    const newSteps = [{ id: 2, stepOrder: 0 }];
    const insertChain = makeInsertChain(newSteps);
    const db = makeMockDb({ insertChain });

    const result = await replaceWorkflowSteps(db, 1, [
      { type: "email", delayMs: 0, config: { subject: "a", body: "a" } },
    ]);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalled();
    expect(result).toEqual(newSteps);
  });
});

// ---------------------------------------------------------------------------
// updateWorkflow / softDeleteWorkflow
// ---------------------------------------------------------------------------

describe("updateWorkflow", () => {
  it("updates and returns the workflow", async () => {
    const updated = { id: 1, name: "New name" };
    const db = makeMockDb({ updateChain: makeUpdateChain([updated]) });

    const result = await updateWorkflow(db, 1, {
      name: "New name",
      updatedBy: 1,
    });
    expect(result).toEqual(updated);
  });
});

describe("softDeleteWorkflow", () => {
  it("sets deletedAt/deletedBy and returns the workflow", async () => {
    const deleted = { id: 1, deletedAt: new Date() };
    const db = makeMockDb({ updateChain: makeUpdateChain([deleted]) });

    const result = await softDeleteWorkflow(db, 1, 2);
    expect(result).toEqual(deleted);
  });
});
