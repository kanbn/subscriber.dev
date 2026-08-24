import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { IntegrationsController } from "../integrations.controller.js";
import { IntegrationsService } from "../integrations.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentByPublicId: vi.fn(),
}));

const mockUser = { id: 1, email: "user@example.com" };
const mockEnvironment = { id: 10, publicId: "env_abc" };

const mockService = {
  upsert: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
  setPrimary: vi.fn(),
};

let controller: IntegrationsController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [IntegrationsController],
    providers: [{ provide: IntegrationsService, useValue: mockService }],
  }).compile();

  controller = module.get(IntegrationsController);
});

describe("upsert", () => {
  it("delegates to the service with the resolved environment id", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.upsert.mockResolvedValue({ type: "smtp" });

    const result = await controller.upsert(mockUser as any, "env_abc", "smtp", {
      host: "smtp.example.com",
    });

    expect(result).toEqual({ type: "smtp" });
    expect(mockService.upsert).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "smtp",
      { host: "smtp.example.com" },
      1,
    );
  });

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.upsert(mockUser as any, "env_missing", "smtp", {}),
    ).rejects.toThrow(NotFoundException);
    expect(mockService.upsert).not.toHaveBeenCalled();
  });
});

describe("get", () => {
  it("delegates to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.get.mockResolvedValue({ type: "smtp" });

    const result = await controller.get("env_abc", "smtp");

    expect(result).toEqual({ type: "smtp" });
    expect(mockService.get).toHaveBeenCalledWith(expect.anything(), 10, "smtp");
  });

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(controller.get("env_missing", "smtp")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("list", () => {
  it("delegates to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.list.mockResolvedValue({ integrations: [] });

    const result = await controller.list("env_abc");

    expect(result).toEqual({ integrations: [] });
    expect(mockService.list).toHaveBeenCalledWith(expect.anything(), 10);
  });
});

describe("setPrimary", () => {
  it("delegates to the service with the resolved environment id", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.setPrimary.mockResolvedValue({ type: "ses", priority: 1 });

    const result = await controller.setPrimary("env_abc", "ses");

    expect(result).toEqual({ type: "ses", priority: 1 });
    expect(mockService.setPrimary).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "ses",
    );
  });

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(controller.setPrimary("env_missing", "ses")).rejects.toThrow(
      NotFoundException,
    );
    expect(mockService.setPrimary).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("delegates to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );

    await controller.delete("env_abc", "smtp");

    expect(mockService.delete).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "smtp",
    );
  });

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(controller.delete("env_missing", "smtp")).rejects.toThrow(
      NotFoundException,
    );
  });
});
