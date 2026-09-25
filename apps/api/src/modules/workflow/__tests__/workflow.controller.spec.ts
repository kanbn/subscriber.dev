import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowController } from "../workflow.controller.js";
import { WorkflowService } from "../workflow.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

const mockUser = { id: 1, email: "user@example.com" };
const mockEnvironment = { id: 10, publicId: "env_abc" };

const mockService = {
  createWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
  listRuns: vi.fn(),
  triggerBroadcast: vi.fn(),
  previewBroadcast: vi.fn(),
  listBroadcasts: vi.fn(),
  getBroadcast: vi.fn(),
  pauseBroadcast: vi.fn(),
  resumeBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
};

let controller: WorkflowController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [WorkflowController],
    providers: [{ provide: WorkflowService, useValue: mockService }],
  }).compile();

  controller = module.get(WorkflowController);
});

describe("triggerWorkflow", () => {
  it("delegates to the service", async () => {
    mockService.triggerWorkflow.mockResolvedValue({
      triggered: true,
      runPublicId: "run_1",
    });

    const result = await controller.triggerWorkflow(
      mockUser as any,
      mockEnvironment as any,
      {
        key: "user-signup",
        subscriber: { email: "a@example.com" },
      } as any,
    );

    expect(result).toEqual({ triggered: true, runPublicId: "run_1" });
    expect(mockService.triggerWorkflow).toHaveBeenCalledWith(
      {},
      10,
      expect.objectContaining({ key: "user-signup", triggeredBy: 1 }),
    );
  });
});

describe("createWorkflow", () => {
  it("delegates to the service", async () => {
    mockService.createWorkflow.mockResolvedValue({ publicId: "wf_1" });

    const result = await controller.createWorkflow(
      mockUser as any,
      mockEnvironment as any,
      {
        key: "user-signup",
        name: "Signup",
        steps: [{ subject: "hi", body: "hi" }],
      } as any,
    );

    expect(result).toEqual({ publicId: "wf_1" });
  });
});

describe("getWorkflow", () => {
  it("delegates to the service", async () => {
    mockService.getWorkflow.mockResolvedValue({ publicId: "wf_1" });

    const result = await controller.getWorkflow(mockEnvironment as any, "wf_1");

    expect(result).toEqual({ publicId: "wf_1" });
    expect(mockService.getWorkflow).toHaveBeenCalledWith({}, 10, "wf_1");
  });
});

describe("deleteWorkflow", () => {
  it("delegates to the service", async () => {
    await controller.deleteWorkflow(
      mockUser as any,
      mockEnvironment as any,
      "wf_1",
    );

    expect(mockService.deleteWorkflow).toHaveBeenCalledWith({}, 10, "wf_1", 1);
  });
});

describe("listWorkflowRuns", () => {
  it("delegates to the service with pagination params", async () => {
    mockService.listRuns.mockResolvedValue({ runs: [], limit: 20, offset: 0 });

    const result = await controller.listWorkflowRuns(
      mockEnvironment as any,
      "wf_1",
      {
        limit: 20,
        offset: 0,
      } as any,
    );

    expect(result).toEqual({ runs: [], limit: 20, offset: 0 });
    expect(mockService.listRuns).toHaveBeenCalledWith({}, 10, "wf_1", {
      limit: 20,
      offset: 0,
    });
  });
});

describe("previewBroadcast", () => {
  it("delegates to the service", async () => {
    mockService.previewBroadcast.mockResolvedValue({ matchedCount: 42 });

    const result = await controller.previewBroadcast(
      mockEnvironment as any,
      "wf_1",
      {
        audience: { type: "optedIn" },
      } as any,
    );

    expect(result).toEqual({ matchedCount: 42 });
    expect(mockService.previewBroadcast).toHaveBeenCalledWith({}, 10, "wf_1", {
      type: "optedIn",
    });
  });
});

describe("triggerBroadcast", () => {
  it("delegates to the service", async () => {
    mockService.triggerBroadcast.mockResolvedValue({
      broadcastId: "bc_1",
      status: "pending",
    });

    const result = await controller.triggerBroadcast(
      mockUser as any,
      mockEnvironment as any,
      "wf_1",
      { audience: { type: "optedIn" } } as any,
    );

    expect(result).toEqual({ broadcastId: "bc_1", status: "pending" });
    expect(mockService.triggerBroadcast).toHaveBeenCalledWith(
      {},
      10,
      "wf_1",
      { type: "optedIn" },
      1,
      { sendOverHours: undefined },
    );
  });

  it("passes the send window through", async () => {
    mockService.triggerBroadcast.mockResolvedValue({
      broadcastId: "bc_1",
      status: "pending",
    });

    await controller.triggerBroadcast(
      mockUser as any,
      mockEnvironment as any,
      "wf_1",
      { audience: { type: "optedIn" }, sendOverHours: 24 } as any,
    );

    expect(mockService.triggerBroadcast).toHaveBeenCalledWith(
      {},
      10,
      "wf_1",
      { type: "optedIn" },
      1,
      { sendOverHours: 24 },
    );
  });
});

describe.each([
  ["pauseBroadcast", "paused"],
  ["resumeBroadcast", "queued"],
  ["cancelBroadcast", "cancelled"],
] as const)("%s", (method, status) => {
  it("delegates to the service", async () => {
    mockService[method].mockResolvedValue({ publicId: "bc_1", status });

    const result = await controller[method](
      mockEnvironment as any,
      "wf_1",
      "bc_1",
    );

    expect(result).toEqual({ publicId: "bc_1", status });
    expect(mockService[method]).toHaveBeenCalledWith({}, 10, "wf_1", "bc_1");
  });
});

describe("listBroadcasts", () => {
  it("delegates to the service with pagination params", async () => {
    mockService.listBroadcasts.mockResolvedValue({
      broadcasts: [],
      limit: 20,
      offset: 0,
    });

    const result = await controller.listBroadcasts(
      mockEnvironment as any,
      "wf_1",
      {
        limit: 20,
        offset: 0,
      } as any,
    );

    expect(result).toEqual({ broadcasts: [], limit: 20, offset: 0 });
    expect(mockService.listBroadcasts).toHaveBeenCalledWith({}, 10, "wf_1", {
      limit: 20,
      offset: 0,
    });
  });
});

describe("getBroadcast", () => {
  it("delegates to the service", async () => {
    mockService.getBroadcast.mockResolvedValue({
      publicId: "bc_1",
      status: "queued",
    });

    const result = await controller.getBroadcast(
      mockEnvironment as any,
      "wf_1",
      "bc_1",
    );

    expect(result).toEqual({ publicId: "bc_1", status: "queued" });
    expect(mockService.getBroadcast).toHaveBeenCalledWith(
      {},
      10,
      "wf_1",
      "bc_1",
    );
  });
});
