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

describe("oneClickUnsubscribe", () => {
  it("unsubscribes using the token from the query string", async () => {
    mockService.unsubscribeByToken.mockResolvedValue({ unsubscribed: true });

    const result = await controller.oneClickUnsubscribe("good-token");

    expect(result).toEqual({ unsubscribed: true });
    expect(mockService.unsubscribeByToken).toHaveBeenCalledWith(
      {},
      "good-token",
    );
  });

  it("rejects a request with no token without calling the service", async () => {
    await expect(controller.oneClickUnsubscribe(undefined)).rejects.toThrow(
      "Invalid or expired unsubscribe link",
    );
    expect(mockService.unsubscribeByToken).not.toHaveBeenCalled();
  });
});

describe("oneClickUnsubscribePage", () => {
  it("redirects to the web confirmation page without unsubscribing", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.com");

    const result = controller.oneClickUnsubscribePage("a+b");

    expect(result).toEqual({
      url: "https://app.example.com/unsubscribe?token=a%2Bb",
      statusCode: 302,
    });
    expect(mockService.unsubscribeByToken).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
