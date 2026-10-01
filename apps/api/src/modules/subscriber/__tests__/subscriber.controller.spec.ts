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
  addTag: vi.fn(),
  removeTag: vi.fn(),
  listTags: vi.fn(),
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
    mockService.listSubscribers.mockResolvedValue({
      subscribers: [],
      limit: 20,
      offset: 0,
    });

    const result = await controller.listSubscribers(mockEnvironment as any, {
      limit: 20,
      offset: 0,
    });

    expect(result.subscribers).toEqual([]);
    expect(mockService.listSubscribers).toHaveBeenCalledWith({}, 10, {
      limit: 20,
      offset: 0,
    });
  });

  it("passes the search query through to the service", async () => {
    mockService.listSubscribers.mockResolvedValue({
      subscribers: [],
      limit: 20,
      offset: 0,
    });

    await controller.listSubscribers(
      mockEnvironment as any,
      {
        limit: 20,
        offset: 0,
        q: "ali",
      } as any,
    );

    expect(mockService.listSubscribers).toHaveBeenCalledWith({}, 10, {
      limit: 20,
      offset: 0,
      q: "ali",
    });
  });
});

// ---------------------------------------------------------------------------
// GET /:subscriberId — getSubscriber
// ---------------------------------------------------------------------------

describe("getSubscriber", () => {
  it("returns subscriber when found", async () => {
    mockService.getSubscriber.mockResolvedValue(mockSubscriberResponse);

    const result = await controller.getSubscriber(
      mockEnvironment as any,
      "sub_abc",
    );

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(mockService.getSubscriber).toHaveBeenCalledWith({}, 10, "sub_abc");
  });

  it("propagates NotFoundException from service when subscriber missing", async () => {
    mockService.getSubscriber.mockRejectedValue(
      new NotFoundException("Subscriber not found"),
    );

    await expect(
      controller.getSubscriber(mockEnvironment as any, "sub_missing"),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// POST / — createSubscriber
// ---------------------------------------------------------------------------

describe("createSubscriber", () => {
  it("delegates creation to the service", async () => {
    mockService.createSubscriber.mockResolvedValue(mockSubscriberResponse);

    const input = { email: "alice@example.com", preferences: { email: true } };
    const result = await controller.createSubscriber(
      mockUser as any,
      mockEnvironment as any,
      input as any,
    );

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(mockService.createSubscriber).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        environmentId: 10,
        email: "alice@example.com",
        createdBy: 1,
        createdVia: "api",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /bulk — bulkUpsertSubscribers
// ---------------------------------------------------------------------------

describe("bulkUpsertSubscribers", () => {
  it("delegates to the service", async () => {
    const serviceResult = {
      results: [{ index: 0, status: "created" }],
      summary: { created: 1, updated: 0, errored: 0 },
    };
    mockService.bulkUpsertSubscribers.mockResolvedValue(serviceResult);

    const input = { subscribers: [{ email: "alice@example.com" }] };
    const result = await controller.bulkUpsertSubscribers(
      mockUser as any,
      mockEnvironment as any,
      input as any,
    );

    expect(result).toEqual(serviceResult);
    expect(mockService.bulkUpsertSubscribers).toHaveBeenCalledWith(
      {},
      10,
      input.subscribers,
      1,
      "api",
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /:subscriberId — updateSubscriber
// ---------------------------------------------------------------------------

describe("updateSubscriber", () => {
  it("delegates update to the service", async () => {
    vi.mocked(subscriberRepo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    mockService.updateSubscriber.mockResolvedValue({
      subscriber: mockSubscriberResponse.subscriber,
    });

    const result = await controller.updateSubscriber(
      mockUser as any,
      mockEnvironment as any,
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

  it("throws NotFoundException when subscriber does not exist in environment", async () => {
    vi.mocked(subscriberRepo.getSubscriberByPublicId).mockResolvedValue(
      undefined,
    );

    await expect(
      controller.updateSubscriber(
        mockUser as any,
        mockEnvironment as any,
        "sub_missing",
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
    mockService.deleteSubscriber.mockResolvedValue(undefined);

    const result = await controller.deleteSubscriber(
      mockUser as any,
      mockEnvironment as any,
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

  it("propagates NotFoundException from service", async () => {
    mockService.deleteSubscriber.mockRejectedValue(
      new NotFoundException("Subscriber not found"),
    );

    await expect(
      controller.deleteSubscriber(
        mockUser as any,
        mockEnvironment as any,
        "sub_missing",
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// POST /:subscriberId/tags — addTag
// ---------------------------------------------------------------------------

describe("addTag", () => {
  it("adds the tag when environment exists", async () => {
    mockService.addTag.mockResolvedValue({ tag: "vip" });

    const result = await controller.addTag(
      mockUser as any,
      mockEnvironment as any,
      "sub_abc",
      {
        tag: "vip",
      } as any,
    );

    expect(result).toEqual({ tag: "vip" });
    expect(mockService.addTag).toHaveBeenCalledWith(
      {},
      10,
      "sub_abc",
      "vip",
      1,
    );
  });

  it("propagates NotFoundException from service", async () => {
    mockService.addTag.mockRejectedValue(
      new NotFoundException("Subscriber not found"),
    );

    await expect(
      controller.addTag(
        mockUser as any,
        mockEnvironment as any,
        "sub_missing",
        {
          tag: "vip",
        } as any,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:subscriberId/tags/:tag — removeTag
// ---------------------------------------------------------------------------

describe("removeTag", () => {
  it("removes the tag and returns void", async () => {
    mockService.removeTag.mockResolvedValue(undefined);

    const result = await controller.removeTag(
      mockEnvironment as any,
      "sub_abc",
      "vip",
    );

    expect(result).toBeUndefined();
    expect(mockService.removeTag).toHaveBeenCalledWith(
      {},
      10,
      "sub_abc",
      "vip",
    );
  });
});

// ---------------------------------------------------------------------------
// GET /tags — listTags
// ---------------------------------------------------------------------------

describe("listTags", () => {
  it("returns the distinct tags when environment exists", async () => {
    mockService.listTags.mockResolvedValue({ tags: ["beta", "vip"] });

    const result = await controller.listTags(mockEnvironment as any);

    expect(result).toEqual({ tags: ["beta", "vip"] });
    expect(mockService.listTags).toHaveBeenCalledWith({}, 10);
  });
});
