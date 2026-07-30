import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as repo from "@subscriber.dev/db/repository/subscriber.repo";

import { SubscriberService } from "../subscriber.service.js";

// Mock the entire repo module before importing the service
vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberByPublicId: vi.fn(),
  getSubscriberById: vi.fn(),
  getSubscriberByEmail: vi.fn(),
  getSubscriberByExternalId: vi.fn(),
  getEnvironmentById: vi.fn(),
  listSubscribers: vi.fn(),
  createSubscriber: vi.fn(),
  updateSubscriber: vi.fn(),
  softDeleteSubscriber: vi.fn(),
  createSubscriberPreferences: vi.fn(),
  getLatestPreferences: vi.fn(),
}));

vi.mock("@subscriber.dev/shared/utils", () => ({
  createEmailUnsubscribeLink: vi.fn((publicId: string) =>
    Promise.resolve(`https://api.example.com/unsubscribe?token=${publicId}`),
  ),
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

let service: SubscriberService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new SubscriberService();
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

    const result = await service.getSubscriber(mockDb, 10, "sub_abc");

    expect(result.subscriber.publicId).toBe("sub_abc");
    expect(result.subscriber.unsubscribeUrl).toBe(
      "https://api.example.com/unsubscribe?token=sub_abc",
    );
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
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue({
      ...mockSubscriber,
      environmentId: 999,
    } as any);

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
    expect(result.subscribers[0]?.unsubscribeUrl).toBe(
      "https://api.example.com/unsubscribe?token=sub_abc",
    );
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
    vi.mocked(repo.getSubscriberByPublicId).mockResolvedValue({
      ...mockSubscriber,
      environmentId: 999,
    } as any);

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
