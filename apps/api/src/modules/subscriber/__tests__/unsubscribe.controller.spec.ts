import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriberService } from "../subscriber.service.js";
import { UnsubscribeController } from "../unsubscribe.controller.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

const mockService = {
  unsubscribeByToken: vi.fn(),
};

let controller: UnsubscribeController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [UnsubscribeController],
    providers: [{ provide: SubscriberService, useValue: mockService }],
  }).compile();

  controller = module.get(UnsubscribeController);
});

describe("unsubscribe", () => {
  it("delegates to the service with the token and returns its result", async () => {
    mockService.unsubscribeByToken.mockResolvedValue({ unsubscribed: true });

    const result = await controller.unsubscribe({ token: "good-token" });

    expect(result).toEqual({ unsubscribed: true });
    expect(mockService.unsubscribeByToken).toHaveBeenCalledWith(
      {},
      "good-token",
    );
  });

  it("propagates errors from the service (e.g. invalid token)", async () => {
    mockService.unsubscribeByToken.mockRejectedValue(new Error("not found"));

    await expect(
      controller.unsubscribe({ token: "bad-token" }),
    ).rejects.toThrow("not found");
  });
});
