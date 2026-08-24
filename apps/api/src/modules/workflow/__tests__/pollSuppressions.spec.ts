import { beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { pollSuppressions } from "../pollSuppressions.js";

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  listAll: vi.fn(),
  updateLastBounceCheckAt: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberByEmail: vi.fn(),
  getLatestPreferences: vi.fn(),
  createSubscriberPreferences: vi.fn(),
}));

vi.mock("../../../common/encryption.js", () => ({
  decrypt: vi.fn(() => JSON.stringify({ apiToken: "test-token" })),
}));

const checkBounces = vi.fn();

vi.mock("../../integrations/providers/index.js", () => ({
  INTEGRATION_PROVIDERS: {
    fake: {
      type: "fake",
      configSchema: { parse: (v: unknown) => v },
      secretSchema: { parse: (v: unknown) => v },
      send: vi.fn(),
      get checkBounces() {
        return checkBounces;
      },
    },
    smtp: {
      type: "smtp",
      configSchema: { parse: (v: unknown) => v },
      secretSchema: { parse: (v: unknown) => v },
      send: vi.fn(),
    },
  },
}));

const mockDb = {} as any;

const fakeIntegration = {
  id: 1,
  environmentId: 5,
  type: "fake",
  config: {},
  encryptedSecret: "encrypted-blob",
  lastBounceCheckAt: null,
};

const smtpIntegration = {
  id: 2,
  environmentId: 5,
  type: "smtp",
  config: {},
  encryptedSecret: "encrypted-blob",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pollSuppressions", () => {
  it("skips integrations whose provider has no checkBounces", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      smtpIntegration,
    ] as any);

    await pollSuppressions(mockDb);

    expect(subscriberRepo.getSubscriberByEmail).not.toHaveBeenCalled();
  });

  it("skips integrations with no encrypted secret", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      { ...fakeIntegration, encryptedSecret: null },
    ] as any);

    await pollSuppressions(mockDb);

    expect(checkBounces).not.toHaveBeenCalled();
  });

  it("opts a matched subscriber out of email on a hard bounce", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        email: "bounced@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
    ]);
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue({
      id: 42,
    } as any);
    vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
      email: true,
    } as any);

    await pollSuppressions(mockDb);

    expect(subscriberRepo.getSubscriberByEmail).toHaveBeenCalledWith(
      mockDb,
      5,
      "bounced@example.com",
    );
    expect(subscriberRepo.createSubscriberPreferences).toHaveBeenCalledWith(
      mockDb,
      { subscriberId: 42, email: false },
    );
  });

  it("does nothing when the email doesn't match a subscriber in that environment", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        email: "unknown@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
    ]);
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue(undefined);

    await pollSuppressions(mockDb);

    expect(subscriberRepo.createSubscriberPreferences).not.toHaveBeenCalled();
  });

  it("does not re-opt-out a subscriber already opted out", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        email: "bounced@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
    ]);
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue({
      id: 42,
    } as any);
    vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
      email: false,
    } as any);

    await pollSuppressions(mockDb);

    expect(subscriberRepo.createSubscriberPreferences).not.toHaveBeenCalled();
  });

  it("continues processing other integrations when one throws", async () => {
    const otherFakeIntegration = {
      ...fakeIntegration,
      id: 3,
      environmentId: 6,
    };
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
      otherFakeIntegration,
    ] as any);
    checkBounces
      .mockRejectedValueOnce(new Error("Cloudflare API down"))
      .mockResolvedValueOnce([
        {
          email: "bounced@example.com",
          bounceType: "hard",
          reason: "hard_bounce",
          occurredAt: new Date("2026-08-24T10:00:00Z"),
        },
      ]);
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue({
      id: 42,
    } as any);
    vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
      email: true,
    } as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await pollSuppressions(mockDb);

    expect(consoleSpy).toHaveBeenCalled();
    expect(subscriberRepo.createSubscriberPreferences).toHaveBeenCalledWith(
      mockDb,
      { subscriberId: 42, email: false },
    );
    consoleSpy.mockRestore();
  });

  it("passes the integration's lastBounceCheckAt as the since cursor", async () => {
    const lastBounceCheckAt = new Date("2026-08-20T00:00:00Z");
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      { ...fakeIntegration, lastBounceCheckAt },
    ] as any);
    checkBounces.mockResolvedValue([]);

    await pollSuppressions(mockDb);

    expect(checkBounces).toHaveBeenCalledWith(
      {},
      { apiToken: "test-token" },
      lastBounceCheckAt,
    );
  });

  it("passes undefined as since when there's no prior cursor", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([]);

    await pollSuppressions(mockDb);

    expect(checkBounces).toHaveBeenCalledWith(
      {},
      { apiToken: "test-token" },
      undefined,
    );
  });

  it("advances the cursor to the latest occurredAt seen", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        email: "older@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T09:00:00Z"),
      },
      {
        email: "newer@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T11:00:00Z"),
      },
    ]);
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue({
      id: 42,
    } as any);
    vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
      email: true,
    } as any);

    await pollSuppressions(mockDb);

    expect(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).toHaveBeenCalledWith(mockDb, 1, new Date("2026-08-24T11:00:00Z"));
  });

  it("does not move the cursor when no bounces were returned", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([]);

    await pollSuppressions(mockDb);

    expect(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).not.toHaveBeenCalled();
  });
});
