import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BouncesController } from "../bounces.controller.js";
import { WorkflowService } from "../workflow.service.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

const mockService = {
  recordBounceEvent: vi.fn(),
};

let controller: BouncesController;
let previousSecret: string | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  previousSecret = process.env.BOUNCE_WEBHOOK_SECRET;
  process.env.BOUNCE_WEBHOOK_SECRET = "test-secret";

  const module: TestingModule = await Test.createTestingModule({
    controllers: [BouncesController],
    providers: [{ provide: WorkflowService, useValue: mockService }],
  }).compile();

  controller = module.get(BouncesController);
});

afterEach(() => {
  process.env.BOUNCE_WEBHOOK_SECRET = previousSecret;
});

describe("recordInboundBounce", () => {
  const body = {
    runStepPublicId: "run_step_abc",
    bounceType: "hard" as const,
    reason: "no such user",
  };

  it("delegates to the service when the bearer secret matches", async () => {
    await controller.recordInboundBounce("Bearer test-secret", body);

    expect(mockService.recordBounceEvent).toHaveBeenCalledWith({}, body);
  });

  it("throws Unauthorized when the bearer secret is wrong", async () => {
    await expect(
      controller.recordInboundBounce("Bearer wrong-secret", body),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockService.recordBounceEvent).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when no authorization header is sent", async () => {
    await expect(
      controller.recordInboundBounce(undefined, body),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockService.recordBounceEvent).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when BOUNCE_WEBHOOK_SECRET isn't configured", async () => {
    delete process.env.BOUNCE_WEBHOOK_SECRET;

    await expect(
      controller.recordInboundBounce("Bearer test-secret", body),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockService.recordBounceEvent).not.toHaveBeenCalled();
  });
});
