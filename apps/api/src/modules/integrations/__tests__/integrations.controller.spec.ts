import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationsController } from "../integrations.controller.js";
import { IntegrationsService } from "../integrations.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
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
    mockService.upsert.mockResolvedValue({ type: "smtp" });

    const result = await controller.upsert(
      mockUser as any,
      mockEnvironment as any,
      "smtp",
      { host: "smtp.example.com" },
    );

    expect(result).toEqual({ type: "smtp" });
    expect(mockService.upsert).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "smtp",
      { host: "smtp.example.com" },
      1,
    );
  });
});

describe("get", () => {
  it("delegates to the service", async () => {
    mockService.get.mockResolvedValue({ type: "smtp" });

    const result = await controller.get(mockEnvironment as any, "smtp");

    expect(result).toEqual({ type: "smtp" });
    expect(mockService.get).toHaveBeenCalledWith(expect.anything(), 10, "smtp");
  });
});

describe("list", () => {
  it("delegates to the service", async () => {
    mockService.list.mockResolvedValue({ integrations: [] });

    const result = await controller.list(mockEnvironment as any);

    expect(result).toEqual({ integrations: [] });
    expect(mockService.list).toHaveBeenCalledWith(expect.anything(), 10);
  });
});

describe("setPrimary", () => {
  it("delegates to the service with the resolved environment id", async () => {
    mockService.setPrimary.mockResolvedValue({ type: "ses", priority: 1 });

    const result = await controller.setPrimary(mockEnvironment as any, "ses");

    expect(result).toEqual({ type: "ses", priority: 1 });
    expect(mockService.setPrimary).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "ses",
    );
  });
});

describe("delete", () => {
  it("delegates to the service", async () => {
    await controller.delete(mockEnvironment as any, "smtp");

    expect(mockService.delete).toHaveBeenCalledWith(
      expect.anything(),
      10,
      "smtp",
    );
  });
});
