import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import { resolveAudienceSubscriberIds } from "../audienceQuery.js";
import { WorkflowService } from "../workflow.service.js";

vi.mock("../audienceQuery.js", () => ({
  resolveAudienceSubscriberIds: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflow.repo", () => ({
  getWorkflowByKey: vi.fn(),
  getWorkflowByPublicId: vi.fn(),
  listStepsForWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  replaceWorkflowSteps: vi.fn(),
  updateWorkflow: vi.fn(),
  softDeleteWorkflow: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  createBroadcast: vi.fn(),
  listBroadcastsForWorkflow: vi.fn(),
  getBroadcastByPublicId: vi.fn(),
  getBroadcastStepCounts: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  createRunWithSteps: vi.fn(),
  setRunStepBullJobId: vi.fn(),
  listPendingRunStepsForSubscriber: vi.fn(),
  cancelPendingForSubscriber: vi.fn(),
  listRunsForWorkflow: vi.fn(),
  listRunsForEnvironment: vi.fn(),
  getRunStepByPublicId: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  findSubscriberForUpsert: vi.fn(),
}));

const mockDb = {} as dbClient;

const mockQueue = {
  add: vi.fn(),
  remove: vi.fn(),
};

const mockBroadcastDispatchQueue = {
  add: vi.fn(),
};

const mockBounceEventsQueue = {
  add: vi.fn(),
};

let service: WorkflowService;

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.remove.mockResolvedValue(undefined);
  service = new WorkflowService(
    mockQueue as any,
    mockBroadcastDispatchQueue as any,
    mockBounceEventsQueue as any,
  );
});

// ---------------------------------------------------------------------------
// triggerWorkflow
// ---------------------------------------------------------------------------

describe("triggerWorkflow", () => {
  const workflow = { id: 1, key: "user-signup", status: "active" as const };
  const steps = [
    {
      id: 10,
      stepOrder: 0,
      type: "email",
      delayMs: 0,
      config: { subject: "a", body: "a" },
    },
    {
      id: 11,
      stepOrder: 1,
      type: "email",
      delayMs: 172_800_000,
      config: { subject: "b", body: "b" },
    },
  ];
  const subscriber = { id: 100 };

  it("throws NotFoundException when the workflow key doesn't match", async () => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue(undefined);

    await expect(
      service.triggerWorkflow(mockDb, 10, {
        key: "missing",
        subscriber: { email: "a@example.com" },
        triggeredBy: 1,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns triggered:false without creating a run when the workflow is paused", async () => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue({
      ...workflow,
      status: "paused",
    } as any);

    const result = await service.triggerWorkflow(mockDb, 10, {
      key: "user-signup",
      subscriber: { email: "a@example.com" },
      triggeredBy: 1,
    });

    expect(result).toEqual({ triggered: false, reason: "workflow_paused" });
    expect(workflowRunRepo.createRunWithSteps).not.toHaveBeenCalled();
  });

  it("returns triggered:false when the workflow has no steps", async () => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);

    const result = await service.triggerWorkflow(mockDb, 10, {
      key: "user-signup",
      subscriber: { email: "a@example.com" },
      triggeredBy: 1,
    });

    expect(result).toEqual({
      triggered: false,
      reason: "workflow_has_no_steps",
    });
  });

  it("throws NotFoundException when no subscriber matches", async () => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      steps as any,
    );
    vi.mocked(subscriberRepo.findSubscriberForUpsert).mockResolvedValue(
      undefined,
    );

    await expect(
      service.triggerWorkflow(mockDb, 10, {
        key: "user-signup",
        subscriber: { email: "a@example.com" },
        triggeredBy: 1,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("schedules each step with its cumulative delay and stores the returned BullMQ job id", async () => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      steps as any,
    );
    vi.mocked(subscriberRepo.findSubscriberForUpsert).mockResolvedValue(
      subscriber as any,
    );

    const run = { id: 5, publicId: "run_abc" };
    const runSteps = [
      { id: 200, stepOrder: 0 },
      { id: 201, stepOrder: 1 },
    ];
    vi.mocked(workflowRunRepo.createRunWithSteps).mockResolvedValue({
      run,
      runSteps,
    } as any);
    mockQueue.add
      .mockResolvedValueOnce({ id: "job-200" })
      .mockResolvedValueOnce({ id: "job-201" });

    const result = await service.triggerWorkflow(mockDb, 10, {
      key: "user-signup",
      subscriber: { email: "a@example.com" },
      triggeredBy: 1,
    });

    expect(result).toEqual({ triggered: true, runPublicId: "run_abc" });

    // step 0 has delayMs 0 -> cumulative 0; step 1 has delayMs 172_800_000 -> cumulative 172_800_000
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      1,
      "send-step",
      { runStepId: 200 },
      expect.objectContaining({ delay: 0, jobId: "run-step-200" }),
    );
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      2,
      "send-step",
      { runStepId: 201 },
      expect.objectContaining({ delay: 172_800_000, jobId: "run-step-201" }),
    );

    expect(workflowRunRepo.setRunStepBullJobId).toHaveBeenCalledWith(
      mockDb,
      200,
      "job-200",
    );
    expect(workflowRunRepo.setRunStepBullJobId).toHaveBeenCalledWith(
      mockDb,
      201,
      "job-201",
    );
  });
});

// ---------------------------------------------------------------------------
// cancelPendingRunsForSubscriber
// ---------------------------------------------------------------------------

describe("cancelPendingRunsForSubscriber", () => {
  it("no-ops when there are no pending run-steps", async () => {
    vi.mocked(
      workflowRunRepo.listPendingRunStepsForSubscriber,
    ).mockResolvedValue([]);

    await service.cancelPendingRunsForSubscriber(mockDb, 100, "opted out");

    expect(mockQueue.remove).not.toHaveBeenCalled();
    expect(workflowRunRepo.cancelPendingForSubscriber).not.toHaveBeenCalled();
  });

  it("removes each BullMQ job then cancels the run-steps and runs in one call", async () => {
    vi.mocked(
      workflowRunRepo.listPendingRunStepsForSubscriber,
    ).mockResolvedValue([
      { id: 1, bullJobId: "run-step-1" },
      { id: 2, bullJobId: "run-step-2" },
    ] as any);

    await service.cancelPendingRunsForSubscriber(mockDb, 100, "opted out");

    expect(mockQueue.remove).toHaveBeenCalledWith("run-step-1");
    expect(mockQueue.remove).toHaveBeenCalledWith("run-step-2");
    expect(workflowRunRepo.cancelPendingForSubscriber).toHaveBeenCalledWith(
      mockDb,
      100,
      [1, 2],
      "opted out",
    );
  });

  it("ignores errors removing an already-processed BullMQ job", async () => {
    vi.mocked(
      workflowRunRepo.listPendingRunStepsForSubscriber,
    ).mockResolvedValue([{ id: 1, bullJobId: "run-step-1" }] as any);
    mockQueue.remove.mockRejectedValueOnce(new Error("not found"));

    await expect(
      service.cancelPendingRunsForSubscriber(mockDb, 100, "opted out"),
    ).resolves.not.toThrow();
    expect(workflowRunRepo.cancelPendingForSubscriber).toHaveBeenCalledWith(
      mockDb,
      100,
      [1],
      "opted out",
    );
  });
});

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe("createWorkflow", () => {
  it("passes email step config straight through", async () => {
    const workflow = {
      publicId: "wf_abc",
      key: "user-signup",
      name: "Signup",
      description: null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(workflowRepo.createWorkflow).mockResolvedValue({
      workflow,
      steps: [
        {
          publicId: "step_1",
          stepOrder: 0,
          type: "email",
          delayMs: 0,
          config: { subject: "hi", body: "hi" },
        },
      ],
    } as any);

    const result = await service.createWorkflow(mockDb, 10, {
      key: "user-signup",
      name: "Signup",
      type: "automation",
      steps: [{ type: "email", delayMs: 0, subject: "hi", body: "hi" }],
      createdBy: 1,
    });

    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        steps: [
          { type: "email", delayMs: 0, config: { subject: "hi", body: "hi" } },
        ],
      }),
    );
    expect(result.steps[0]).toEqual(
      expect.objectContaining({ subject: "hi", body: "hi" }),
    );
  });

  it("passes webhook step config straight through, without email fields bleeding in", async () => {
    const workflow = {
      publicId: "wf_abc",
      key: "user-signup",
      name: "Signup",
      description: null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const webhookConfig = {
      url: "https://discord.com/api/webhooks/xyz",
      body: '{"content":"hi"}',
    };
    vi.mocked(workflowRepo.createWorkflow).mockResolvedValue({
      workflow,
      steps: [
        {
          publicId: "step_1",
          stepOrder: 0,
          type: "webhook",
          delayMs: 0,
          config: webhookConfig,
        },
      ],
    } as any);

    const result = await service.createWorkflow(mockDb, 10, {
      key: "user-signup",
      name: "Signup",
      type: "automation",
      steps: [{ type: "webhook", delayMs: 0, ...webhookConfig }],
      createdBy: 1,
    });

    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        steps: [{ type: "webhook", delayMs: 0, config: webhookConfig }],
      }),
    );
    expect(result.steps[0]).toEqual(expect.objectContaining(webhookConfig));
    expect(result.steps[0]).not.toHaveProperty("subject");
  });
});

// ---------------------------------------------------------------------------
// listRuns
// ---------------------------------------------------------------------------

describe("listRuns", () => {
  it("maps the subscriber and steps for each run", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
      key: "user-signup",
    } as any);
    vi.mocked(workflowRunRepo.listRunsForWorkflow).mockResolvedValue([
      {
        publicId: "run_abc",
        status: "active",
        triggeredAt: new Date("2026-01-01T00:00:00Z"),
        completedAt: null,
        subscriber: {
          publicId: "sub_abc",
          email: "alice@example.com",
          name: null,
          externalId: null,
        },
        steps: [
          {
            stepOrder: 0,
            type: "email",
            status: "sent",
            scheduledAt: new Date("2026-01-01T00:00:00Z"),
            sentAt: new Date("2026-01-01T00:00:01Z"),
            errorMessage: null,
          },
        ],
      },
    ] as any);

    const result = await service.listRuns(mockDb, 10, "wf_abc", {
      limit: 20,
      offset: 0,
    });

    expect(result.runs[0]?.subscriber).toEqual({
      publicId: "sub_abc",
      email: "alice@example.com",
      name: null,
      externalId: null,
    });
    expect(result.runs[0]?.steps[0]).toEqual(
      expect.objectContaining({ type: "email", status: "sent" }),
    );
  });

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(
      service.listRuns(mockDb, 10, "wf_missing", { limit: 20, offset: 0 }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// listRunsForEnvironment
// ---------------------------------------------------------------------------

describe("listRunsForEnvironment", () => {
  it("maps the workflow, subscriber, and steps for each run", async () => {
    vi.mocked(workflowRunRepo.listRunsForEnvironment).mockResolvedValue([
      {
        publicId: "run_abc",
        status: "active",
        triggeredAt: new Date("2026-01-01T00:00:00Z"),
        completedAt: null,
        workflow: {
          publicId: "wf_abc",
          key: "user-signup",
          name: "User Signup",
        },
        subscriber: {
          publicId: "sub_abc",
          email: "alice@example.com",
          name: null,
          externalId: null,
        },
        steps: [
          {
            stepOrder: 0,
            type: "email",
            status: "sent",
            scheduledAt: new Date("2026-01-01T00:00:00Z"),
            sentAt: new Date("2026-01-01T00:00:01Z"),
            errorMessage: null,
          },
        ],
      },
    ] as any);

    const result = await service.listRunsForEnvironment(mockDb, 10, {
      limit: 20,
      offset: 0,
    });

    expect(result.runs[0]?.workflow).toEqual({
      publicId: "wf_abc",
      key: "user-signup",
      name: "User Signup",
    });
    expect(result.runs[0]?.subscriber).toEqual({
      publicId: "sub_abc",
      email: "alice@example.com",
      name: null,
      externalId: null,
    });
    expect(result.runs[0]?.steps[0]).toEqual(
      expect.objectContaining({ type: "email", status: "sent" }),
    );
  });
});

// ---------------------------------------------------------------------------
// previewBroadcast
// ---------------------------------------------------------------------------

describe("previewBroadcast", () => {
  const workflow = { id: 1, key: "user-signup", status: "active" as const };
  const steps = [
    { id: 10, stepOrder: 0, type: "email", delayMs: 0, config: {} },
  ];
  const audience = { type: "optedIn" as const };

  it("returns the resolved audience size without creating a broadcast", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      steps as any,
    );
    vi.mocked(resolveAudienceSubscriberIds).mockResolvedValue([1, 2, 3]);

    const result = await service.previewBroadcast(
      mockDb,
      10,
      "wf_abc",
      audience,
    );

    expect(result).toEqual({ matchedCount: 3 });
    expect(workflowBroadcastRepo.createBroadcast).not.toHaveBeenCalled();
    expect(mockBroadcastDispatchQueue.add).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(
      service.previewBroadcast(mockDb, 10, "wf_missing", audience),
    ).rejects.toThrow(NotFoundException);
    expect(resolveAudienceSubscriberIds).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when the workflow is paused", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      ...workflow,
      status: "paused",
    } as any);

    await expect(
      service.previewBroadcast(mockDb, 10, "wf_abc", audience),
    ).rejects.toThrow(BadRequestException);
    expect(resolveAudienceSubscriberIds).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when the workflow has no steps", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);

    await expect(
      service.previewBroadcast(mockDb, 10, "wf_abc", audience),
    ).rejects.toThrow(BadRequestException);
    expect(resolveAudienceSubscriberIds).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// triggerBroadcast
// ---------------------------------------------------------------------------

describe("triggerBroadcast", () => {
  const workflow = { id: 1, key: "user-signup", status: "active" as const };
  const steps = [
    { id: 10, stepOrder: 0, type: "email", delayMs: 0, config: {} },
  ];
  const audience = { type: "optedIn" as const };

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(
      service.triggerBroadcast(mockDb, 10, "wf_missing", audience, 1),
    ).rejects.toThrow(NotFoundException);
    expect(workflowBroadcastRepo.createBroadcast).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when the workflow is paused", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      ...workflow,
      status: "paused",
    } as any);

    await expect(
      service.triggerBroadcast(mockDb, 10, "wf_abc", audience, 1),
    ).rejects.toThrow(BadRequestException);
    expect(workflowBroadcastRepo.createBroadcast).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when the workflow has no steps", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);

    await expect(
      service.triggerBroadcast(mockDb, 10, "wf_abc", audience, 1),
    ).rejects.toThrow(BadRequestException);
    expect(workflowBroadcastRepo.createBroadcast).not.toHaveBeenCalled();
  });

  it("creates the broadcast row and enqueues the dispatch job", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      steps as any,
    );
    vi.mocked(workflowBroadcastRepo.createBroadcast).mockResolvedValue({
      id: 5,
      publicId: "bc_abc",
      status: "pending",
    } as any);

    const result = await service.triggerBroadcast(
      mockDb,
      10,
      "wf_abc",
      audience,
      1,
    );

    expect(result).toEqual({ broadcastId: "bc_abc", status: "pending" });
    expect(workflowBroadcastRepo.createBroadcast).toHaveBeenCalledWith(mockDb, {
      workflowId: 1,
      environmentId: 10,
      audienceQuery: audience,
      createdBy: 1,
    });
    expect(mockBroadcastDispatchQueue.add).toHaveBeenCalledWith(
      "dispatch",
      { broadcastId: 5 },
      expect.objectContaining({ attempts: 3 }),
    );
  });
});

// ---------------------------------------------------------------------------
// listBroadcasts
// ---------------------------------------------------------------------------

describe("listBroadcasts", () => {
  it("maps broadcast rows to summaries", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
    } as any);
    vi.mocked(
      workflowBroadcastRepo.listBroadcastsForWorkflow,
    ).mockResolvedValue([
      {
        publicId: "bc_abc",
        status: "queued",
        matchedCount: 42,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ] as any);

    const result = await service.listBroadcasts(mockDb, 10, "wf_abc", {
      limit: 20,
      offset: 0,
    });

    expect(result.broadcasts).toEqual([
      {
        publicId: "bc_abc",
        status: "queued",
        matchedCount: 42,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    expect(result.limit).toBe(20);
  });

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(
      service.listBroadcasts(mockDb, 10, "wf_missing", {
        limit: 20,
        offset: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// getBroadcast
// ---------------------------------------------------------------------------

describe("getBroadcast", () => {
  it("returns the broadcast with derived step-outcome counts", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
    } as any);
    vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue({
      id: 5,
      publicId: "bc_abc",
      status: "queued",
      matchedCount: 3,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as any);
    vi.mocked(workflowBroadcastRepo.getBroadcastStepCounts).mockResolvedValue({
      pending: 1,
      sent: 2,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      bounced: 0,
    });

    const result = await service.getBroadcast(mockDb, 10, "wf_abc", "bc_abc");

    expect(result).toEqual({
      publicId: "bc_abc",
      status: "queued",
      matchedCount: 3,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      sentCount: 2,
      failedCount: 0,
      skippedCount: 0,
      pendingCount: 1,
      bouncedCount: 0,
    });
  });

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(
      service.getBroadcast(mockDb, 10, "wf_missing", "bc_abc"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the broadcast does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
    } as any);
    vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      service.getBroadcast(mockDb, 10, "wf_abc", "bc_missing"),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("recordBounceEvent", () => {
  it("enqueues a bounce-events job with a deterministic jobId keyed by the run step", async () => {
    vi.mocked(workflowRunRepo.getRunStepByPublicId).mockResolvedValue({
      id: 42,
    } as any);

    await service.recordBounceEvent(mockDb, {
      runStepPublicId: "run_step_abc",
      bounceType: "hard",
      reason: "no such user",
    });

    expect(mockBounceEventsQueue.add).toHaveBeenCalledWith(
      "record-bounce",
      { runStepId: 42, bounceType: "hard", reason: "no such user" },
      expect.objectContaining({ jobId: "bounce-42" }),
    );
  });

  it("throws NotFoundException when the run step doesn't exist", async () => {
    vi.mocked(workflowRunRepo.getRunStepByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      service.recordBounceEvent(mockDb, {
        runStepPublicId: "run_step_missing",
        bounceType: "hard",
        reason: "no such user",
      }),
    ).rejects.toThrow(NotFoundException);
    expect(mockBounceEventsQueue.add).not.toHaveBeenCalled();
  });
});
