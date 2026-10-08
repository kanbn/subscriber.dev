import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
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
  listTriggersForWorkflow: vi.fn(),
  replaceWorkflowTriggers: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  listByEnvironment: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowBroadcast.repo", () => ({
  createBroadcast: vi.fn(),
  listBroadcastsForWorkflow: vi.fn(),
  getBroadcastByPublicId: vi.fn(),
  getBroadcastStepCounts: vi.fn(),
  getBroadcastBounceBreakdown: vi.fn(),
  transitionBroadcastStatus: vi.fn(),
  cancelPendingStepsForBroadcast: vi.fn(),
  pauseBroadcast: vi.fn(),
  resumeBroadcast: vi.fn(),
  countRunsForBroadcast: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  createRunWithSteps: vi.fn(),
  getRunByIdempotencyKey: vi.fn(),
  listUnqueuedPendingSteps: vi.fn(),
  setRunStepBullJobId: vi.fn(),
  listPendingRunStepsForSubscriber: vi.fn(),
  cancelPendingForSubscriber: vi.fn(),
  listRunsForWorkflow: vi.fn(),
  listRunsForEnvironment: vi.fn(),
  getRunStepByPublicId: vi.fn(),
  getWorkflowStepCounts: vi.fn(),
  getWorkflowBounceBreakdown: vi.fn(),
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

const mockBroadcastResumeQueue = {
  add: vi.fn(),
};

let service: WorkflowService;

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.remove.mockResolvedValue(undefined);
  vi.mocked(workflowRepo.listTriggersForWorkflow).mockResolvedValue([]);
  vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue(
    [],
  );
  service = new WorkflowService(
    mockQueue as any,
    mockBroadcastDispatchQueue as any,
    mockBounceEventsQueue as any,
    mockBroadcastResumeQueue as any,
    { isEnabled: () => false } as any,
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
    // Freeze the clock so delays (scheduledAt - now) are exact, and return
    // each step with its planned scheduledAt like the real insert does.
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.mocked(workflowRunRepo.createRunWithSteps).mockImplementation(
      async (_db, data) =>
        ({
          run,
          runSteps: data.steps.map((step, i) => ({
            id: 200 + i,
            stepOrder: i,
            scheduledAt: step.scheduledAt,
          })),
        }) as any,
    );
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

describe("triggerWorkflow with an idempotency key", () => {
  const input = {
    key: "user-signup",
    subscriber: { email: "a@example.com" },
    triggeredBy: 1,
    idempotencyKey: "inbound:1:user-signup",
  };

  beforeEach(() => {
    vi.mocked(workflowRepo.getWorkflowByKey).mockResolvedValue({
      id: 1,
      status: "active",
    } as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([
      { id: 10, stepOrder: 0, type: "email", delayMs: 0, config: {} },
    ] as any);
    vi.mocked(subscriberRepo.findSubscriberForUpsert).mockResolvedValue({
      id: 100,
    } as any);
    vi.mocked(workflowRunRepo.listUnqueuedPendingSteps).mockResolvedValue([]);
  });

  it("stores the key on the new run", async () => {
    vi.mocked(workflowRunRepo.getRunByIdempotencyKey).mockResolvedValue(
      undefined,
    );
    vi.mocked(workflowRunRepo.createRunWithSteps).mockResolvedValue({
      run: { id: 5, publicId: "run_abc" },
      runSteps: [],
    } as any);

    await expect(service.triggerWorkflow(mockDb, 10, input)).resolves.toEqual({
      triggered: true,
      runPublicId: "run_abc",
    });
    expect(workflowRunRepo.createRunWithSteps).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ idempotencyKey: "inbound:1:user-signup" }),
    );
  });

  it("returns the existing run on a retry instead of creating another, queuing any of its steps that never were", async () => {
    const stranded = [{ id: 200, scheduledAt: new Date() }];
    vi.mocked(workflowRunRepo.getRunByIdempotencyKey).mockResolvedValue({
      id: 5,
      publicId: "run_abc",
    });
    vi.mocked(workflowRunRepo.listUnqueuedPendingSteps).mockResolvedValue(
      stranded,
    );
    mockQueue.add.mockResolvedValue({ id: "run-step-200" });

    await expect(service.triggerWorkflow(mockDb, 10, input)).resolves.toEqual({
      triggered: true,
      runPublicId: "run_abc",
    });
    expect(workflowRunRepo.createRunWithSteps).not.toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith(
      "send-step",
      { runStepId: 200 },
      expect.objectContaining({ jobId: "run-step-200" }),
    );
  });

  it("returns the winner's run when a concurrent trigger with the same key hits the unique constraint", async () => {
    vi.mocked(workflowRunRepo.getRunByIdempotencyKey)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 5, publicId: "run_abc" });
    vi.mocked(workflowRunRepo.createRunWithSteps).mockRejectedValue(
      Object.assign(new Error("Failed query"), { cause: { code: "23505" } }),
    );

    await expect(service.triggerWorkflow(mockDb, 10, input)).resolves.toEqual({
      triggered: true,
      runPublicId: "run_abc",
    });
  });

  it("rethrows a unique-constraint clash when no trigger was given a key", async () => {
    const clash = Object.assign(new Error("Failed query"), {
      cause: { code: "23505" },
    });
    vi.mocked(workflowRunRepo.createRunWithSteps).mockRejectedValue(clash);

    await expect(
      service.triggerWorkflow(mockDb, 10, {
        ...input,
        idempotencyKey: undefined,
      }),
    ).rejects.toBe(clash);
    expect(workflowRunRepo.getRunByIdempotencyKey).not.toHaveBeenCalled();
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
      undefined,
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
      undefined,
    );
  });

  it("can cancel just one workflow's runs, returning how many it cancelled", async () => {
    const scope = { workflowId: 7, keepIdempotencyKey: "inbound:1:7" };
    vi.mocked(
      workflowRunRepo.listPendingRunStepsForSubscriber,
    ).mockResolvedValue([{ id: 1, bullJobId: "run-step-1" }] as any);
    vi.mocked(workflowRunRepo.cancelPendingForSubscriber).mockResolvedValue(1);

    await expect(
      service.cancelPendingRunsForSubscriber(mockDb, 100, "exited", scope),
    ).resolves.toBe(1);
    expect(
      workflowRunRepo.listPendingRunStepsForSubscriber,
    ).toHaveBeenCalledWith(mockDb, 100, scope);
    expect(workflowRunRepo.cancelPendingForSubscriber).toHaveBeenCalledWith(
      mockDb,
      100,
      [1],
      "exited",
      scope,
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
      triggers: [],
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
      steps: [
        {
          type: "email",
          delayMs: 0,
          subject: "hi",
          body: "hi",
          layout: "default",
        },
      ],
      createdBy: 1,
    });

    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        steps: [
          {
            type: "email",
            delayMs: 0,
            config: { subject: "hi", body: "hi", layout: "default" },
          },
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
      triggers: [],
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
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        url: "https://discord.com/***/xyz",
        body: webhookConfig.body,
      }),
    );
    expect(result.steps[0]).not.toHaveProperty("subject");
  });
});

// ---------------------------------------------------------------------------
// updateWorkflow – webhook URL redaction
// ---------------------------------------------------------------------------

describe("workflow triggers", () => {
  const workflow = {
    id: 1,
    publicId: "wf_abc",
    environmentId: 10,
    key: "trial-welcome",
    name: "Trial welcome",
    description: null,
    status: "active" as const,
    type: "automation" as const,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const steps = [
    {
      type: "email" as const,
      delayMs: 0,
      subject: "s",
      body: "b",
      layout: "default" as const,
    },
  ];

  function connectStripe() {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      { type: "cloudflare", encryptedSecret: "x" },
      { type: "stripe", encryptedSecret: "x" },
    ] as any);
  }

  const create = (overrides: Record<string, unknown>) =>
    service.createWorkflow(mockDb, 10, {
      key: "trial-welcome",
      name: "Trial welcome",
      type: "automation",
      steps,
      createdBy: 1,
      ...overrides,
    });

  it("saves the triggers once each and returns them labelled and active", async () => {
    connectStripe();
    vi.mocked(workflowRepo.createWorkflow).mockImplementation(
      async (_db, data) =>
        ({
          workflow,
          steps: [],
          triggers: [
            ...(data.triggers ?? []).map((t) => ({ ...t, action: "start" })),
            ...(data.exitConditions ?? []).map((t) => ({
              ...t,
              action: "exit",
            })),
          ],
        }) as any,
    );

    const result = await create({
      triggers: [
        { source: "stripe", event: "trial_started" },
        { source: "stripe", event: "trial_started" },
        { source: "stripe", event: "checkout.session.completed" },
      ],
    });

    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        triggers: [
          { source: "stripe", event: "trial_started" },
          { source: "stripe", event: "checkout.session.completed" },
        ],
      }),
    );
    expect(result.triggers).toEqual([
      {
        source: "stripe",
        event: "trial_started",
        label: "Trial started",
        active: true,
      },
      {
        source: "stripe",
        event: "checkout.session.completed",
        label: "checkout.session.completed",
        active: true,
      },
    ]);
  });

  it("refuses triggers until the source's integration is connected", async () => {
    await expect(
      create({ triggers: [{ source: "stripe", event: "trial_started" }] }),
    ).rejects.toThrow(
      "Connect the Stripe integration before adding its triggers",
    );
    expect(workflowRepo.createWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    [
      { source: "polar", event: "trial_started" },
      'Unknown trigger source "polar"',
    ],
    [
      { source: "stripe", event: "trial_begun" },
      'Unknown Stripe event "trial_begun"',
    ],
  ])("rejects %o", async (trigger, message) => {
    connectStripe();
    await expect(create({ triggers: [trigger] })).rejects.toThrow(message);
  });

  it("refuses triggers on a broadcast workflow", async () => {
    connectStripe();
    await expect(
      create({
        type: "broadcast",
        triggers: [{ source: "stripe", event: "trial_started" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("replaces the triggers on update, and keeps them when omitted", async () => {
    connectStripe();
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.updateWorkflow).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);
    vi.mocked(workflowRepo.replaceWorkflowTriggers).mockResolvedValue([
      { source: "stripe", event: "payment_failed" },
    ] as any);

    await service.updateWorkflow(mockDb, 10, "wf_abc", {
      triggers: [{ source: "stripe", event: "payment_failed" }],
      updatedBy: 1,
    });
    expect(workflowRepo.replaceWorkflowTriggers).toHaveBeenCalledWith(
      mockDb,
      workflow,
      "start",
      [{ source: "stripe", event: "payment_failed" }],
    );

    vi.mocked(workflowRepo.replaceWorkflowTriggers).mockClear();
    await service.updateWorkflow(mockDb, 10, "wf_abc", {
      name: "Renamed",
      updatedBy: 1,
    });
    expect(workflowRepo.replaceWorkflowTriggers).not.toHaveBeenCalled();
  });

  it("keeps a workflow's existing triggers editable while their integration is disconnected, but refuses new ones", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.updateWorkflow).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);
    vi.mocked(workflowRepo.listTriggersForWorkflow).mockResolvedValue([
      { action: "start", source: "stripe", event: "trial_started" },
      { action: "start", source: "stripe", event: "payment_failed" },
    ] as any);
    vi.mocked(workflowRepo.replaceWorkflowTriggers).mockResolvedValue([
      { source: "stripe", event: "trial_started" },
    ] as any);

    await service.updateWorkflow(mockDb, 10, "wf_abc", {
      triggers: [{ source: "stripe", event: "trial_started" }],
      updatedBy: 1,
    });
    expect(workflowRepo.replaceWorkflowTriggers).toHaveBeenCalledWith(
      mockDb,
      workflow,
      "start",
      [{ source: "stripe", event: "trial_started" }],
    );

    await expect(
      service.updateWorkflow(mockDb, 10, "wf_abc", {
        triggers: [
          { source: "stripe", event: "trial_started" },
          { source: "stripe", event: "trial_ending" },
        ],
        updatedBy: 1,
      }),
    ).rejects.toThrow(
      "Connect the Stripe integration before adding its triggers",
    );
  });

  it("saves exit conditions alongside triggers and returns them separately", async () => {
    connectStripe();
    vi.mocked(workflowRepo.createWorkflow).mockImplementation(
      async (_db, data) =>
        ({
          workflow,
          steps: [],
          triggers: [
            ...(data.triggers ?? []).map((t) => ({ ...t, action: "start" })),
            ...(data.exitConditions ?? []).map((t) => ({
              ...t,
              action: "exit",
            })),
          ],
        }) as any,
    );

    const result = await create({
      triggers: [{ source: "stripe", event: "trial_started" }],
      exitConditions: [{ source: "stripe", event: "trial_converted" }],
    });

    expect(workflowRepo.createWorkflow).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        triggers: [{ source: "stripe", event: "trial_started" }],
        exitConditions: [{ source: "stripe", event: "trial_converted" }],
      }),
    );
    expect(result.triggers).toEqual([
      expect.objectContaining({ event: "trial_started" }),
    ]);
    expect(result.exitConditions).toEqual([
      {
        source: "stripe",
        event: "trial_converted",
        label: "Trial converted to paid",
        active: true,
      },
    ]);
  });

  it("validates exit conditions like triggers", async () => {
    await expect(
      create({
        exitConditions: [{ source: "stripe", event: "trial_started" }],
      }),
    ).rejects.toThrow("Connect the Stripe integration");
    connectStripe();
    await expect(
      create({ exitConditions: [{ source: "stripe", event: "nope" }] }),
    ).rejects.toThrow('Unknown Stripe event "nope"');
  });

  it("replaces exit conditions on update without touching the triggers", async () => {
    connectStripe();
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.updateWorkflow).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);

    await service.updateWorkflow(mockDb, 10, "wf_abc", {
      exitConditions: [{ source: "stripe", event: "trial_converted" }],
      updatedBy: 1,
    });

    expect(workflowRepo.replaceWorkflowTriggers).toHaveBeenCalledTimes(1);
    expect(workflowRepo.replaceWorkflowTriggers).toHaveBeenCalledWith(
      mockDb,
      workflow,
      "exit",
      [{ source: "stripe", event: "trial_converted" }],
    );
  });

  it("shows triggers as inactive while their integration is disconnected", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([]);
    vi.mocked(workflowRepo.listTriggersForWorkflow).mockResolvedValue([
      { action: "start", source: "stripe", event: "trial_started" },
    ] as any);
    vi.mocked(workflowRunRepo.getWorkflowStepCounts).mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      bounced: 0,
    } as any);
    vi.mocked(workflowRunRepo.getWorkflowBounceBreakdown).mockResolvedValue({
      hard: 0,
      soft: 0,
    } as any);

    const result = await service.getWorkflow(mockDb, 10, "wf_abc");

    expect(result.triggers).toEqual([
      expect.objectContaining({ event: "trial_started", active: false }),
    ]);
  });
});

describe("updateWorkflow webhook URLs", () => {
  const realUrl = "https://discord.com/api/webhooks/123/secret-token";
  const workflow = {
    id: 1,
    publicId: "wf_abc",
    key: "user-signup",
    name: "Signup",
    description: null,
    status: "active" as const,
    type: "automation" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(
      workflow as any,
    );
    vi.mocked(workflowRepo.updateWorkflow).mockResolvedValue(workflow as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([
      {
        publicId: "step_1",
        stepOrder: 0,
        type: "webhook",
        delayMs: 0,
        config: { url: realUrl, body: "{}" },
      },
    ] as any);
    vi.mocked(workflowRepo.replaceWorkflowSteps).mockImplementation(
      async (_db, _id, steps) =>
        steps.map((s, i) => ({
          ...s,
          publicId: `step_${i}`,
          stepOrder: i,
        })) as any,
    );
  });

  it("restores the stored URL when the redacted form is sent back", async () => {
    const result = await service.updateWorkflow(mockDb, 10, "wf_abc", {
      steps: [
        {
          type: "webhook",
          delayMs: 0,
          url: "https://discord.com/***oken",
          body: '{"content":"changed"}',
        },
      ],
      updatedBy: 1,
    });

    expect(workflowRepo.replaceWorkflowSteps).toHaveBeenCalledWith(mockDb, 1, [
      {
        type: "webhook",
        delayMs: 0,
        config: { url: realUrl, body: '{"content":"changed"}' },
      },
    ]);
    expect(result.steps[0]?.url).toBe("https://discord.com/***oken");
  });

  it("stores a new URL as given", async () => {
    const newUrl = "https://hooks.slack.com/services/T0/B0/other";
    await service.updateWorkflow(mockDb, 10, "wf_abc", {
      steps: [{ type: "webhook", delayMs: 0, url: newUrl, body: "{}" }],
      updatedBy: 1,
    });

    expect(workflowRepo.replaceWorkflowSteps).toHaveBeenCalledWith(mockDb, 1, [
      { type: "webhook", delayMs: 0, config: { url: newUrl, body: "{}" } },
    ]);
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
      sendOverMs: null,
      createdBy: 1,
    });
    expect(mockBroadcastDispatchQueue.add).toHaveBeenCalledWith(
      "dispatch",
      { broadcastId: 5 },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it("stores the send window in milliseconds", async () => {
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

    await service.triggerBroadcast(mockDb, 10, "wf_abc", audience, 1, {
      sendOverHours: 1.5,
    });

    expect(workflowBroadcastRepo.createBroadcast).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ sendOverMs: 90 * 60 * 1000 }),
    );
  });
});

// ---------------------------------------------------------------------------
// pauseBroadcast / resumeBroadcast / cancelBroadcast
// ---------------------------------------------------------------------------

describe("broadcast pause/resume/cancel", () => {
  const broadcast = {
    id: 5,
    publicId: "bc_abc",
    status: "queued" as const,
    matchedCount: 100,
    sendOverMs: null,
    pausedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const stillSending = {
    pending: 40,
    sent: 60,
    skipped: 0,
    failed: 0,
    cancelled: 0,
    bounced: 0,
  };

  beforeEach(() => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
    } as any);
    vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue(
      broadcast as any,
    );
    vi.mocked(workflowBroadcastRepo.getBroadcastStepCounts).mockResolvedValue(
      stillSending,
    );
    vi.mocked(workflowBroadcastRepo.countRunsForBroadcast).mockResolvedValue(
      100,
    );
  });

  it("pauses a broadcast that's still sending", async () => {
    vi.mocked(workflowBroadcastRepo.pauseBroadcast).mockResolvedValue({
      ...broadcast,
      status: "paused",
    } as any);

    const result = await service.pauseBroadcast(mockDb, 10, "wf_abc", "bc_abc");

    expect(result.status).toBe("paused");
    expect(workflowBroadcastRepo.pauseBroadcast).toHaveBeenCalledWith(
      mockDb,
      5,
    );
  });

  it("rejects pausing a broadcast in any other status", async () => {
    vi.mocked(workflowBroadcastRepo.pauseBroadcast).mockResolvedValue(
      undefined,
    );

    await expect(
      service.pauseBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
    ).rejects.toThrow(ConflictException);
  });

  it.each(["pauseBroadcast", "cancelBroadcast"] as const)(
    "%s rejects a broadcast that has already finished sending",
    async (method) => {
      vi.mocked(workflowBroadcastRepo.getBroadcastStepCounts).mockResolvedValue(
        { ...stillSending, pending: 0, sent: 100 },
      );

      await expect(
        service[method](mockDb, 10, "wf_abc", "bc_abc"),
      ).rejects.toThrow("Broadcast has already finished sending");
      expect(workflowBroadcastRepo.pauseBroadcast).not.toHaveBeenCalled();
      expect(
        workflowBroadcastRepo.transitionBroadcastStatus,
      ).not.toHaveBeenCalled();
    },
  );

  it("allows cancelling when some subscribers were skipped (fails open)", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastStepCounts).mockResolvedValue({
      ...stillSending,
      pending: 0,
      sent: 97,
    });
    vi.mocked(workflowBroadcastRepo.countRunsForBroadcast).mockResolvedValue(
      97,
    );
    vi.mocked(
      workflowBroadcastRepo.transitionBroadcastStatus,
    ).mockResolvedValue({ ...broadcast, status: "cancelled" } as any);

    await expect(
      service.cancelBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
    ).resolves.toEqual(expect.objectContaining({ status: "cancelled" }));
  });

  it("still allows pausing while subscribers are being set up", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastStepCounts).mockResolvedValue({
      ...stillSending,
      pending: 0,
      sent: 30,
    });
    vi.mocked(workflowBroadcastRepo.countRunsForBroadcast).mockResolvedValue(
      30,
    );
    vi.mocked(workflowBroadcastRepo.pauseBroadcast).mockResolvedValue({
      ...broadcast,
      status: "paused",
    } as any);

    await expect(
      service.pauseBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
    ).resolves.toEqual(expect.objectContaining({ status: "paused" }));
  });

  it("resumes and queues a reschedule now plus a second pass a minute later", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue({
      ...broadcast,
      status: "paused",
    } as any);
    vi.mocked(workflowBroadcastRepo.resumeBroadcast).mockResolvedValue({
      ...broadcast,
      status: "queued",
    } as any);

    const result = await service.resumeBroadcast(
      mockDb,
      10,
      "wf_abc",
      "bc_abc",
    );

    expect(result.status).toBe("queued");
    expect(workflowBroadcastRepo.resumeBroadcast).toHaveBeenCalledWith(
      mockDb,
      5,
    );
    const delays = mockBroadcastResumeQueue.add.mock.calls.map(
      ([name, data, opts]) => [name, data, opts.delay],
    );
    expect(delays).toEqual([
      ["reschedule", { broadcastId: 5 }, 0],
      ["reschedule", { broadcastId: 5 }, 60_000],
    ]);
  });

  it("rejects resuming a broadcast that isn't paused, without rescheduling", async () => {
    vi.mocked(workflowBroadcastRepo.resumeBroadcast).mockResolvedValue(
      undefined,
    );

    await expect(
      service.resumeBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
    ).rejects.toThrow(ConflictException);
    expect(mockBroadcastResumeQueue.add).not.toHaveBeenCalled();
  });

  it("cancels the broadcast and every pending step", async () => {
    vi.mocked(
      workflowBroadcastRepo.transitionBroadcastStatus,
    ).mockResolvedValue({ ...broadcast, status: "cancelled" } as any);

    const result = await service.cancelBroadcast(
      mockDb,
      10,
      "wf_abc",
      "bc_abc",
    );

    expect(result.status).toBe("cancelled");
    expect(
      workflowBroadcastRepo.transitionBroadcastStatus,
    ).toHaveBeenCalledWith(
      mockDb,
      5,
      ["pending", "queued", "paused"],
      "cancelled",
    );
    expect(
      workflowBroadcastRepo.cancelPendingStepsForBroadcast,
    ).toHaveBeenCalledWith(mockDb, 5, "Broadcast cancelled");
  });

  it("doesn't touch steps when the broadcast can't be cancelled", async () => {
    vi.mocked(
      workflowBroadcastRepo.transitionBroadcastStatus,
    ).mockResolvedValue(undefined);

    await expect(
      service.cancelBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
    ).rejects.toThrow(ConflictException);
    expect(
      workflowBroadcastRepo.cancelPendingStepsForBroadcast,
    ).not.toHaveBeenCalled();
  });

  it("re-dispatches a queued broadcast", async () => {
    const result = await service.redispatchBroadcast(
      mockDb,
      10,
      "wf_abc",
      "bc_abc",
    );

    expect(result.status).toBe("queued");
    expect(mockBroadcastDispatchQueue.add).toHaveBeenCalledWith(
      "dispatch",
      { broadcastId: 5 },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it.each(["pending", "paused", "cancelled", "failed"] as const)(
    "refuses to re-dispatch a %s broadcast",
    async (status) => {
      vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue(
        { ...broadcast, status } as any,
      );

      await expect(
        service.redispatchBroadcast(mockDb, 10, "wf_abc", "bc_abc"),
      ).rejects.toThrow(ConflictException);
      expect(mockBroadcastDispatchQueue.add).not.toHaveBeenCalled();
    },
  );

  it("throws NotFoundException for an unknown broadcast", async () => {
    vi.mocked(workflowBroadcastRepo.getBroadcastByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      service.pauseBroadcast(mockDb, 10, "wf_abc", "bc_missing"),
    ).rejects.toThrow(NotFoundException);
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
        sendOverMs: 2 * 60 * 60 * 1000,
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
        sendOverHours: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
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
// getWorkflow
// ---------------------------------------------------------------------------

describe("getWorkflow", () => {
  it("returns the workflow with derived step-outcome counts", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
      publicId: "wf_abc",
      key: "user-signup",
      name: "Signup",
      description: null,
      status: "active",
      type: "automation",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([
      {
        publicId: "step_1",
        stepOrder: 0,
        type: "email",
        delayMs: 0,
        config: { subject: "hi", body: "hi" },
      },
    ] as any);
    vi.mocked(workflowRunRepo.getWorkflowStepCounts).mockResolvedValue({
      pending: 2,
      sent: 5,
      skipped: 1,
      failed: 1,
      cancelled: 0,
      bounced: 1,
    });
    vi.mocked(workflowRunRepo.getWorkflowBounceBreakdown).mockResolvedValue({
      hard: 1,
      soft: 0,
    });

    const result = await service.getWorkflow(mockDb, 10, "wf_abc");

    expect(result).toEqual(
      expect.objectContaining({
        publicId: "wf_abc",
        sentCount: 5,
        failedCount: 1,
        skippedCount: 1,
        pendingCount: 2,
        bouncedCount: 1,
        hardBounceCount: 1,
        softBounceCount: 0,
        successRate: 5 / 6,
      }),
    );
    expect(workflowRunRepo.getWorkflowStepCounts).toHaveBeenCalledWith(
      mockDb,
      1,
    );
    expect(workflowRunRepo.getWorkflowBounceBreakdown).toHaveBeenCalledWith(
      mockDb,
      1,
    );
  });

  it("reports a null successRate when there have been no sends or failures yet", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 1,
      publicId: "wf_abc",
      key: "user-signup",
      name: "Signup",
      description: null,
      status: "active",
      type: "automation",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as any);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue([] as any);
    vi.mocked(workflowRunRepo.getWorkflowStepCounts).mockResolvedValue({
      pending: 3,
      sent: 0,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      bounced: 0,
    });
    vi.mocked(workflowRunRepo.getWorkflowBounceBreakdown).mockResolvedValue({
      hard: 0,
      soft: 0,
    });

    const result = await service.getWorkflow(mockDb, 10, "wf_abc");

    expect(result.successRate).toBeNull();
  });

  it("throws NotFoundException when the workflow does not exist", async () => {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue(undefined);

    await expect(service.getWorkflow(mockDb, 10, "wf_missing")).rejects.toThrow(
      NotFoundException,
    );
    expect(workflowRunRepo.getWorkflowStepCounts).not.toHaveBeenCalled();
    expect(workflowRunRepo.getWorkflowBounceBreakdown).not.toHaveBeenCalled();
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
      sendOverMs: null,
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
    vi.mocked(
      workflowBroadcastRepo.getBroadcastBounceBreakdown,
    ).mockResolvedValue({ hard: 0, soft: 0 });

    const result = await service.getBroadcast(mockDb, 10, "wf_abc", "bc_abc");

    expect(result).toEqual({
      publicId: "bc_abc",
      status: "queued",
      matchedCount: 3,
      sendOverHours: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      sentCount: 2,
      failedCount: 0,
      skippedCount: 0,
      pendingCount: 1,
      bouncedCount: 0,
      hardBounceCount: 0,
      softBounceCount: 0,
      successRate: 1,
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
