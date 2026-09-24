import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as repo from "@subscriber.dev/db/repository/subscriber.repo";
import * as tagRepo from "@subscriber.dev/db/repository/subscriberTag.repo";
import * as sharedUtils from "@subscriber.dev/shared/utils";

import { SubscriberService } from "../subscriber.service.js";

// Mock the entire repo module before importing the service
vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberByPublicId: vi.fn(),
  getSubscriberById: vi.fn(),
  getSubscriberByEmail: vi.fn(),
  getSubscriberByExternalId: vi.fn(),
  findSubscriberForUpsert: vi.fn(),
  getEnvironmentById: vi.fn(),
  listSubscribers: vi.fn(),
  createSubscriber: vi.fn(),
  updateSubscriber: vi.fn(),
  softDeleteSubscriber: vi.fn(),
  createSubscriberPreferences: vi.fn(),
  getLatestPreferences: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriberTag.repo", () => ({
  addTag: vi.fn(),
  removeTag: vi.fn(),
  listTagsForSubscriber: vi.fn(),
  listDistinctTagsForEnvironment: vi.fn(),
}));

vi.mock("@subscriber.dev/shared/utils", () => ({
  createEmailUnsubscribeLink: vi.fn(
    (_environmentId: number, publicId: string) =>
      Promise.resolve(`https://api.example.com/unsubscribe?token=${publicId}`),
  ),
  verifyEmailUnsubscribeToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockDb = {} as dbClient;

const mockSubscriber = {
  id: 1,
  publicId: "sub_abc",
  environmentId: 10,
  email: "alice@example.com",
  phone: null,
  externalId: "ext_1",
  firstName: "Alice",
  lastName: "Smith",
  name: "Alice Smith",
  attributes: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  deletedAt: null,
  createdBy: 1,
  updatedBy: 1,
  deletedBy: null,
};

const mockPreferences = {
  id: 1,
  publicId: "pref_abc",
  subscriberId: 1,
  email: true,
  version: 1,
  createdAt: new Date("2024-01-01"),
};

const mockEnvironment = {
  id: 10,
  publicId: "env_abc",
  name: "Production",
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockWorkflowService = {
  cancelPendingRunsForSubscriber: vi.fn(),
};

let service: SubscriberService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new SubscriberService(mockWorkflowService as any);
  vi.mocked(tagRepo.listTagsForSubscriber).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getSubscriber
// ---------------------------------------------------------------------------

describe("getSubscriber", () => {
  it("returns subscriber and preferences when found in the correct environment", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getLatestPreferences).mockResolvedValue(
      mockPreferences as any,
    );
    vi.mocked(tagRepo.listTagsForSubscriber).mockResolvedValue([
      { id: 1, tag: "vip" } as any,
    ]);

    const result = await service.getSubscriber(mockDb, 10, "sub_abc");

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(result.subscriber.unsubscribeUrl).toBe(
      "https://api.example.com/unsubscribe?token=sub_abc",
    );
    expect(result.subscriber.tags).toEqual(["vip"]);
    expect(result.preferences?.email).toBe(true);
  });

  it("returns null preferences when none exist yet", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getLatestPreferences).mockResolvedValue(undefined);

    const result = await service.getSubscriber(mockDb, 10, "sub_abc");
    expect(result.preferences).toBeNull();
  });

  it("throws NotFoundException when subscriber does not exist", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.getSubscriber(mockDb, 10, "sub_missing"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when subscriber belongs to a different environment", async () => {
    // A per-environment-scoped query returns nothing for a publicId that
    // exists only in a different environment.
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(service.getSubscriber(mockDb, 10, "sub_abc")).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// listSubscribers
// ---------------------------------------------------------------------------

describe("listSubscribers", () => {
  it("returns mapped subscribers and pagination info", async () => {
    vi.mocked(repo.listSubscribers).mockResolvedValue([mockSubscriber] as any);

    const result = await service.listSubscribers(mockDb, 10, {
      limit: 20,
      offset: 0,
    });

    expect(result.subscribers).toHaveLength(1);
    expect(result.subscribers[0]?.publicId).toBe("sub_abc");
    expect(result.subscribers[0]).not.toHaveProperty("unsubscribeUrl");
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("returns empty array when no subscribers exist", async () => {
    vi.mocked(repo.listSubscribers).mockResolvedValue([]);

    const result = await service.listSubscribers(mockDb, 10, {
      limit: 20,
      offset: 0,
    });
    expect(result.subscribers).toEqual([]);
  });

  it("forwards limit and offset to the repo", async () => {
    vi.mocked(repo.listSubscribers).mockResolvedValue([]);

    await service.listSubscribers(mockDb, 10, { limit: 5, offset: 15 });

    expect(repo.listSubscribers).toHaveBeenCalledWith(mockDb, 10, {
      limit: 5,
      offset: 15,
    });
  });

  it("forwards the search query to the repo", async () => {
    vi.mocked(repo.listSubscribers).mockResolvedValue([]);

    await service.listSubscribers(mockDb, 10, {
      limit: 20,
      offset: 0,
      q: "ali",
    });

    expect(repo.listSubscribers).toHaveBeenCalledWith(mockDb, 10, {
      limit: 20,
      offset: 0,
      q: "ali",
    });
  });
});

// ---------------------------------------------------------------------------
// updateSubscriber
// ---------------------------------------------------------------------------

describe("updateSubscriber", () => {
  it("returns the updated subscriber", async () => {
    const updated = { ...mockSubscriber, firstName: "Bob" };
    vi.mocked(repo.updateSubscriber).mockResolvedValue(updated as any);

    const result = await service.updateSubscriber(mockDb, {
      subscriberId: 1,
      firstName: "Bob",
      updatedBy: 1,
    });

    expect(result.subscriber.firstName).toBe("Bob");
  });

  it("throws NotFoundException when the update returns nothing (deleted/missing subscriber)", async () => {
    vi.mocked(repo.updateSubscriber).mockResolvedValue(undefined);

    await expect(
      service.updateSubscriber(mockDb, { subscriberId: 999, updatedBy: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it("passes all provided fields to the repo", async () => {
    vi.mocked(repo.updateSubscriber).mockResolvedValue(mockSubscriber as any);

    await service.updateSubscriber(mockDb, {
      subscriberId: 1,
      email: "new@example.com",
      phone: "+1234567890",
      firstName: "Bob",
      updatedBy: 1,
    });

    expect(repo.updateSubscriber).toHaveBeenCalledWith(
      mockDb,
      1,
      expect.objectContaining({
        email: "new@example.com",
        phone: "+1234567890",
        firstName: "Bob",
        updatedBy: 1,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteSubscriber
// ---------------------------------------------------------------------------

describe("deleteSubscriber", () => {
  it("soft deletes successfully", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.softDeleteSubscriber).mockResolvedValue({
      ...mockSubscriber,
      deletedAt: new Date(),
    } as any);

    await expect(
      service.deleteSubscriber(mockDb, 10, "sub_abc", 1),
    ).resolves.toBeUndefined();
    expect(repo.softDeleteSubscriber).toHaveBeenCalledWith(mockDb, 1, 1);
  });

  it("throws NotFoundException when subscriber does not exist", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.deleteSubscriber(mockDb, 10, "sub_missing", 1),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when subscriber belongs to a different environment", async () => {
    // A per-environment-scoped query returns nothing for a publicId that
    // exists only in a different environment.
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.deleteSubscriber(mockDb, 10, "sub_abc", 1),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when soft delete returns nothing (race condition)", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.softDeleteSubscriber).mockResolvedValue(undefined);

    await expect(
      service.deleteSubscriber(mockDb, 10, "sub_abc", 1),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// createSubscriber
// ---------------------------------------------------------------------------

describe("createSubscriber", () => {
  it("throws BadRequestException when neither email nor externalId provided", async () => {
    vi.mocked(repo.getEnvironmentById).mockResolvedValue(
      mockEnvironment as any,
    );

    await expect(
      service.createSubscriber(mockDb, { environmentId: 10, createdBy: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when email is already taken in the environment", async () => {
    vi.mocked(repo.getEnvironmentById).mockResolvedValue(
      mockEnvironment as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(
      mockSubscriber as any,
    );

    await expect(
      service.createSubscriber(mockDb, {
        environmentId: 10,
        email: "alice@example.com",
        createdBy: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when externalId is already taken in the environment", async () => {
    vi.mocked(repo.getEnvironmentById).mockResolvedValue(
      mockEnvironment as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.getSubscriberByExternalId).mockResolvedValue(
      mockSubscriber as any,
    );

    await expect(
      service.createSubscriber(mockDb, {
        environmentId: 10,
        externalId: "ext_1",
        createdBy: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates subscriber and preferences successfully", async () => {
    vi.mocked(repo.getEnvironmentById).mockResolvedValue(
      mockEnvironment as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.createSubscriber).mockResolvedValue(mockSubscriber as any);
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue(
      mockPreferences as any,
    );

    const result = await service.createSubscriber(mockDb, {
      environmentId: 10,
      email: "alice@example.com",
      createdBy: 1,
    });

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(result.preferences.email).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bulkUpsertSubscribers
// ---------------------------------------------------------------------------

describe("bulkUpsertSubscribers", () => {
  it("creates a new subscriber when no existing match is found", async () => {
    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(undefined);
    vi.mocked(repo.createSubscriber).mockResolvedValue(mockSubscriber as any);
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue(
      mockPreferences as any,
    );

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{ email: "alice@example.com" }],
      1,
    );

    expect(result.results).toEqual([
      expect.objectContaining({ index: 0, status: "created" }),
    ]);
    expect(result.summary).toEqual({ created: 1, updated: 0, errored: 0 });
    expect(repo.createSubscriberPreferences).toHaveBeenCalledWith(mockDb, {
      subscriberId: mockSubscriber.id,
      email: true,
    });
  });

  it("updates an existing subscriber when a match is found, without touching preferences if omitted", async () => {
    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.updateSubscriber).mockResolvedValue({
      ...mockSubscriber,
      firstName: "Bob",
    } as any);
    vi.mocked(repo.getLatestPreferences).mockResolvedValue(
      mockPreferences as any,
    );

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{ email: "alice@example.com", firstName: "Bob" }],
      1,
    );

    expect(result.results).toEqual([
      expect.objectContaining({ index: 0, status: "updated" }),
    ]);
    expect(result.summary).toEqual({ created: 0, updated: 1, errored: 0 });
    expect(repo.createSubscriberPreferences).not.toHaveBeenCalled();
  });

  it("creates a new preference version when preferences.email differs from latest", async () => {
    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.updateSubscriber).mockResolvedValue(mockSubscriber as any);
    vi.mocked(repo.getLatestPreferences).mockResolvedValue({
      ...mockPreferences,
      email: true,
    } as any);
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue({
      ...mockPreferences,
      email: false,
      version: 2,
    } as any);

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{ email: "alice@example.com", preferences: { email: false } }],
      1,
    );

    expect(repo.createSubscriberPreferences).toHaveBeenCalledWith(mockDb, {
      subscriberId: mockSubscriber.id,
      email: false,
    });
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        status: "updated",
        preferences: expect.objectContaining({ email: false, version: 2 }),
      }),
    );
  });

  it("errors a row (without failing the batch) when no identifier is provided", async () => {
    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(undefined);
    vi.mocked(repo.createSubscriber).mockResolvedValue(mockSubscriber as any);
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue(
      mockPreferences as any,
    );

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{}, { email: "alice@example.com" }],
      1,
    );

    expect(result.results[0]).toEqual(
      expect.objectContaining({ index: 0, status: "error" }),
    );
    expect(result.results[1]).toEqual(
      expect.objectContaining({ index: 1, status: "created" }),
    );
    expect(result.summary).toEqual({ created: 1, updated: 0, errored: 1 });
  });

  it("errors a row when a provided identifier belongs to a different subscriber", async () => {
    const otherSubscriber = { ...mockSubscriber, id: 2, externalId: "ext_2" };

    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getSubscriberByEmail).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getSubscriberByExternalId).mockResolvedValue(
      otherSubscriber as any,
    );

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{ email: "alice@example.com", externalId: "ext_2" }],
      1,
    );

    expect(result.results[0]).toEqual(
      expect.objectContaining({ index: 0, status: "error" }),
    );
    expect(result.results[0]?.error).toMatch(/externalId/);
    expect(repo.updateSubscriber).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ created: 0, updated: 0, errored: 1 });
  });

  it("isolates a failure on one row from the rest of the batch", async () => {
    vi.mocked(repo.findSubscriberForUpsert).mockResolvedValue(undefined);
    vi.mocked(repo.createSubscriber)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(mockSubscriber as any);
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue(
      mockPreferences as any,
    );

    const result = await service.bulkUpsertSubscribers(
      mockDb,
      10,
      [{ email: "fails@example.com" }, { email: "alice@example.com" }],
      1,
    );

    expect(result.results[0]?.status).toBe("error");
    expect(result.results[1]?.status).toBe("created");
    expect(result.summary).toEqual({ created: 1, updated: 0, errored: 1 });
  });
});

// ---------------------------------------------------------------------------
// unsubscribeByToken
// ---------------------------------------------------------------------------

describe("unsubscribeByToken", () => {
  it("throws NotFoundException for an invalid token", async () => {
    vi.mocked(sharedUtils.verifyEmailUnsubscribeToken).mockResolvedValue(null);

    await expect(
      service.unsubscribeByToken(mockDb, "bad-token"),
    ).rejects.toThrow(NotFoundException);
    expect(repo.getSubscriberByPublicId).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the subscriber no longer exists", async () => {
    vi.mocked(sharedUtils.verifyEmailUnsubscribeToken).mockResolvedValue({
      environmentId: 10,
      subscriberPublicId: "sub_abc",
    });
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.unsubscribeByToken(mockDb, "good-token"),
    ).rejects.toThrow(NotFoundException);
  });

  it("creates a new preference version turning email off", async () => {
    vi.mocked(sharedUtils.verifyEmailUnsubscribeToken).mockResolvedValue({
      environmentId: 10,
      subscriberPublicId: "sub_abc",
    });
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getLatestPreferences).mockResolvedValue(
      mockPreferences as any,
    );
    vi.mocked(repo.createSubscriberPreferences).mockResolvedValue({
      ...mockPreferences,
      email: false,
      version: 2,
    } as any);

    const result = await service.unsubscribeByToken(mockDb, "good-token");

    expect(result).toEqual({ unsubscribed: true });
    expect(repo.createSubscriberPreferences).toHaveBeenCalledWith(mockDb, {
      subscriberId: 1,
      email: false,
    });
  });

  it("is a no-op when already unsubscribed", async () => {
    vi.mocked(sharedUtils.verifyEmailUnsubscribeToken).mockResolvedValue({
      environmentId: 10,
      subscriberPublicId: "sub_abc",
    });
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );
    vi.mocked(repo.getLatestPreferences).mockResolvedValue({
      ...mockPreferences,
      email: false,
    } as any);

    const result = await service.unsubscribeByToken(mockDb, "good-token");

    expect(result).toEqual({ unsubscribed: true });
    expect(repo.createSubscriberPreferences).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addTag / removeTag / listTags
// ---------------------------------------------------------------------------

describe("addTag", () => {
  it("adds the tag and returns it", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );

    const result = await service.addTag(mockDb, 10, "sub_abc", "vip", 1);

    expect(result).toEqual({ tag: "vip" });
    expect(tagRepo.addTag).toHaveBeenCalledWith(mockDb, {
      subscriberId: 1,
      environmentId: 10,
      tag: "vip",
      createdBy: 1,
    });
  });

  it("throws NotFoundException when the subscriber does not exist", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.addTag(mockDb, 10, "sub_missing", "vip", 1),
    ).rejects.toThrow(NotFoundException);
    expect(tagRepo.addTag).not.toHaveBeenCalled();
  });
});

describe("removeTag", () => {
  it("removes the tag", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(
      mockSubscriber as any,
    );

    await service.removeTag(mockDb, 10, "sub_abc", "vip");

    expect(tagRepo.removeTag).toHaveBeenCalledWith(mockDb, 1, "vip");
  });

  it("throws NotFoundException when the subscriber does not exist", async () => {
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue(undefined);

    await expect(
      service.removeTag(mockDb, 10, "sub_missing", "vip"),
    ).rejects.toThrow(NotFoundException);
    expect(tagRepo.removeTag).not.toHaveBeenCalled();
  });
});

describe("listTags", () => {
  it("returns the distinct tags for the environment", async () => {
    vi.mocked(tagRepo.listDistinctTagsForEnvironment).mockResolvedValue([
      "beta",
      "vip",
    ]);

    const result = await service.listTags(mockDb, 10);

    expect(result).toEqual({ tags: ["beta", "vip"] });
  });
});
