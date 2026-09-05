import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { AnalyticsController } from "../analytics.controller.js";
import { AnalyticsService } from "../analytics.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentByPublicId: vi.fn(),
}));

const mockEnvironment = { id: 10, publicId: "env_abc" };

const mockService = {
  getAnalytics: vi.fn(),
};

let controller: AnalyticsController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [AnalyticsController],
    providers: [{ provide: AnalyticsService, useValue: mockService }],
  }).compile();

  controller = module.get(AnalyticsController);
});

describe("getAnalytics", () => {
  it("delegates to the service with the resolved environment id and days", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.getAnalytics.mockResolvedValue({ days: 30 });

    const result = await controller.getAnalytics("env_abc", {
      days: 30,
    } as any);

    expect(result).toEqual({ days: 30 });
    expect(mockService.getAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      10,
      30,
    );
  });

  it("throws NotFoundException when the environment doesn't exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.getAnalytics("env_missing", { days: 30 } as any),
    ).rejects.toThrow(NotFoundException);
    expect(mockService.getAnalytics).not.toHaveBeenCalled();
  });
});
