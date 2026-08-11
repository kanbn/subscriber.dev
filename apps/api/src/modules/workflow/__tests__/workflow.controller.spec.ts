import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { WorkflowController } from "../workflow.controller.js";
import { WorkflowService } from "../workflow.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentByPublicId: vi.fn(),
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
  it("delegates to the service when the environment exists", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.triggerWorkflow.mockResolvedValue({
      triggered: true,
      runPublicId: "run_1",
    });

    const result = await controller.triggerWorkflow(
      mockUser as any,
      "env_abc",
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

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.triggerWorkflow(mockUser as any, "env_missing", {
        key: "user-signup",
        subscriber: { email: "a@example.com" },
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(mockService.triggerWorkflow).not.toHaveBeenCalled();
  });
});

describe("createWorkflow", () => {
  it("delegates to the service when the environment exists", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.createWorkflow.mockResolvedValue({ publicId: "wf_1" });

    const result = await controller.createWorkflow(mockUser as any, "env_abc", {
      key: "user-signup",
      name: "Signup",
      steps: [{ subject: "hi", body: "hi" }],
    } as any);

    expect(result).toEqual({ publicId: "wf_1" });
  });
});

describe("getWorkflow", () => {
  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(controller.getWorkflow("env_missing", "wf_1")).rejects.toThrow(
      NotFoundException,
    );
    expect(mockService.getWorkflow).not.toHaveBeenCalled();
  });
});

describe("deleteWorkflow", () => {
  it("delegates to the service when the environment exists", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );

    await controller.deleteWorkflow(mockUser as any, "env_abc", "wf_1");

    expect(mockService.deleteWorkflow).toHaveBeenCalledWith({}, 10, "wf_1", 1);
  });
});

describe("listWorkflowRuns", () => {
  it("delegates to the service with pagination params", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.listRuns.mockResolvedValue({ runs: [], limit: 20, offset: 0 });

    const result = await controller.listWorkflowRuns("env_abc", "wf_1", {
      limit: 20,
      offset: 0,
    } as any);

    expect(result).toEqual({ runs: [], limit: 20, offset: 0 });
    expect(mockService.listRuns).toHaveBeenCalledWith({}, 10, "wf_1", {
      limit: 20,
      offset: 0,
    });
  });
});
