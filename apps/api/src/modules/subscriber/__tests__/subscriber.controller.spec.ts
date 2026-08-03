import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { SubscriberController } from "../subscriber.controller.js";
import { SubscriberService } from "../subscriber.service.js";

// Mock external deps before importing the controller
vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentByPublicId: vi.fn(),
  getSubscriberByPublicId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = { id: 1, email: "user@example.com" };

const mockEnvironment = { id: 10, publicId: "env_abc" };

const mockSubscriber = {
  id: 1,
  publicId: "sub_abc",
  environmentId: 10,
};

const mockSubscriberResponse = {
  subscriber: {
    publicId: "sub_abc",
    email: "alice@example.com",
    phone: null,
    externalId: null,
    firstName: "Alice",
    lastName: null,
    name: null,
    attributes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  preferences: {
    publicId: "pref_abc",
    email: true,
    version: 1,
    createdAt: new Date(),
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockService = {
  createSubscriber: vi.fn(),
  getSubscriber: vi.fn(),
  listSubscribers: vi.fn(),
  updateSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  updatePreferences: vi.fn(),
  bulkUpsertSubscribers: vi.fn(),
};

let controller: SubscriberController;

beforeEach(async () => {
  vi.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [SubscriberController],
    providers: [{ provide: SubscriberService, useValue: mockService }],
  }).compile();

  controller = module.get(SubscriberController);
});

// ---------------------------------------------------------------------------
// GET / — listSubscribers
// ---------------------------------------------------------------------------

describe("listSubscribers", () => {
  it("returns list when environment exists", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.listSubscribers.mockResolvedValue({
      subscribers: [],
      limit: 20,
      offset: 0,
    });

    const result = await controller.listSubscribers("env_abc", {
      limit: 20,
      offset: 0,
    });

    expect(result.subscribers).toEqual([]);
    expect(mockService.listSubscribers).toHaveBeenCalledWith({}, 10, {
      limit: 20,
      offset: 0,
    });
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.listSubscribers("env_missing", { limit: 20, offset: 0 }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// GET /:subscriberId — getSubscriber
// ---------------------------------------------------------------------------

describe("getSubscriber", () => {
  it("returns subscriber when found", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.getSubscriber.mockResolvedValue(mockSubscriberResponse);

    const result = await controller.getSubscriber("env_abc", "sub_abc");

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(mockService.getSubscriber).toHaveBeenCalledWith({}, 10, "sub_abc");
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.getSubscriber("env_missing", "sub_abc"),
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates NotFoundException from service when subscriber missing", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.getSubscriber.mockRejectedValue(
      new NotFoundException("Subscriber not found"),
    );

    await expect(
      controller.getSubscriber("env_abc", "sub_missing"),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// POST / — createSubscriber
// ---------------------------------------------------------------------------

describe("createSubscriber", () => {
  it("delegates creation to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.createSubscriber.mockResolvedValue(mockSubscriberResponse);

    const input = { email: "alice@example.com", preferences: { email: true } };
    const result = await controller.createSubscriber(
      mockUser as any,
      "env_abc",
      input as any,
    );

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(mockService.createSubscriber).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        environmentId: 10,
        email: "alice@example.com",
        createdBy: 1,
      }),
    );
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.createSubscriber(mockUser as any, "env_missing", {} as any),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// POST /bulk — bulkUpsertSubscribers
// ---------------------------------------------------------------------------

describe("bulkUpsertSubscribers", () => {
  it("delegates to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    const serviceResult = {
      results: [{ index: 0, status: "created" }],
      summary: { created: 1, updated: 0, errored: 0 },
    };
    mockService.bulkUpsertSubscribers.mockResolvedValue(serviceResult);

    const input = { subscribers: [{ email: "alice@example.com" }] };
    const result = await controller.bulkUpsertSubscribers(
      mockUser as any,
      "env_abc",
      input as any,
    );

    expect(result).toEqual(serviceResult);
    expect(mockService.bulkUpsertSubscribers).toHaveBeenCalledWith(
      {},
      10,
      input.subscribers,
      1,
    );
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.bulkUpsertSubscribers(mockUser as any, "env_missing", {
        subscribers: [],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// PATCH /:subscriberId — updateSubscriber
// ---------------------------------------------------------------------------

describe("updateSubscriber", () => {
  it("delegates update to the service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    vi.mocked(subscriberRepo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    mockService.updateSubscriber.mockResolvedValue({
      subscriber: mockSubscriberResponse.subscriber,
    });

    const result = await controller.updateSubscriber(
      mockUser as any,
      "env_abc",
      "sub_abc",
      { firstName: "Bob" } as any,
    );

    expect(mockService.updateSubscriber).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        subscriberId: 1,
        firstName: "Bob",
        updatedBy: 1,
      }),
    );
    expect(result.subscriber).toBeDefined();
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.updateSubscriber(
        mockUser as any,
        "env_missing",
        "sub_abc",
        {} as any,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when subscriber does not exist in environment", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    vi.mocked(subscriberRepo.getSubscriberByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.updateSubscriber(
        mockUser as any,
        "env_abc",
        "sub_missing",
        {} as any,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when subscriber belongs to a different environment", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    // A per-environment-scoped query returns nothing for a publicId that
    // exists only in a different environment.
    vi.mocked(subscriberRepo.getSubscriberByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.updateSubscriber(
        mockUser as any,
        "env_abc",
        "sub_abc",
        {} as any,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:subscriberId — deleteSubscriber
// ---------------------------------------------------------------------------

describe("deleteSubscriber", () => {
  it("deletes successfully and returns void", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.deleteSubscriber.mockResolvedValue(undefined);

    const result = await controller.deleteSubscriber(
      mockUser as any,
      "env_abc",
      "sub_abc",
    );

    expect(result).toBeUndefined();
    expect(mockService.deleteSubscriber).toHaveBeenCalledWith(
      {},
      10,
      "sub_abc",
      1,
    );
  });

  it("throws NotFoundException when environment does not exist", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.deleteSubscriber(mockUser as any, "env_missing", "sub_abc"),
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates NotFoundException from service", async () => {
    vi.mocked(subscriberRepo.getEnvironmentByPublicId).mockResolvedValue(
      mockEnvironment as any,
    );
    mockService.deleteSubscriber.mockRejectedValue(
      new NotFoundException("Subscriber not found"),
    );

    await expect(
      controller.deleteSubscriber(mockUser as any, "env_abc", "sub_missing"),
    ).rejects.toThrow(NotFoundException);
  });
});
