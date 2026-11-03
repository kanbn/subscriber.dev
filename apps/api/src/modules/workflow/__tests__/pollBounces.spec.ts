import { beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import { pollBounces } from "../pollBounces.js";
import { recordBounce } from "../recordBounce.js";

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  listAll: vi.fn(),
  updateLastBounceCheckAt: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  getRunStepByProviderMessageId: vi.fn(),
}));

vi.mock("../recordBounce.js", () => ({
  recordBounce: vi.fn(),
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

describe("pollBounces", () => {
  it("skips integrations whose provider has no checkBounces", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      smtpIntegration,
    ] as any);

    await pollBounces(mockDb);

    expect(
      workflowRunRepo.getRunStepByProviderMessageId,
    ).not.toHaveBeenCalled();
  });

  it("skips integrations with no encrypted secret", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      { ...fakeIntegration, encryptedSecret: null },
    ] as any);

    await pollBounces(mockDb);

    expect(checkBounces).not.toHaveBeenCalled();
  });

  it("records a bounce against the matched run step", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        providerMessageId: "<abc@mail.kan.bn>",
        bounceType: "hard",
        reason: "no such user",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
    ]);
    vi.mocked(workflowRunRepo.getRunStepByProviderMessageId).mockResolvedValue({
      id: 4,
    } as any);

    await pollBounces(mockDb);

    expect(workflowRunRepo.getRunStepByProviderMessageId).toHaveBeenCalledWith(
      mockDb,
      5,
      "<abc@mail.kan.bn>",
    );
    expect(recordBounce).toHaveBeenCalledWith(mockDb, {
      runStepId: 4,
      bounceType: "hard",
      reason: "no such user",
    });
  });

  it("does nothing when the providerMessageId doesn't match a run step", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([
      {
        providerMessageId: "<unknown@mail.kan.bn>",
        bounceType: "hard",
        reason: "no such user",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
    ]);
    vi.mocked(workflowRunRepo.getRunStepByProviderMessageId).mockResolvedValue(
      undefined,
    );

    await pollBounces(mockDb);

    expect(recordBounce).not.toHaveBeenCalled();
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
          providerMessageId: "<abc@mail.kan.bn>",
          bounceType: "hard",
          reason: "no such user",
          occurredAt: new Date("2026-08-24T10:00:00Z"),
        },
      ]);
    vi.mocked(workflowRunRepo.getRunStepByProviderMessageId).mockResolvedValue({
      id: 4,
    } as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await pollBounces(mockDb);

    expect(consoleSpy).toHaveBeenCalled();
    expect(recordBounce).toHaveBeenCalledWith(mockDb, {
      runStepId: 4,
      bounceType: "hard",
      reason: "no such user",
    });
    consoleSpy.mockRestore();
  });

  it("passes the integration's lastBounceCheckAt as the since cursor", async () => {
    const lastBounceCheckAt = new Date("2026-08-20T00:00:00Z");
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      { ...fakeIntegration, lastBounceCheckAt },
    ] as any);
    checkBounces.mockResolvedValue([]);

    await pollBounces(mockDb);

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

    await pollBounces(mockDb);

    expect(checkBounces).toHaveBeenCalledWith(
      {},
      { apiToken: "test-token" },
      undefined,
    );
  });

  it("advances the cursor to the poll time, even when no bounces were found", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue([]);

    const before = new Date();
    await pollBounces(mockDb);
    const after = new Date();

    expect(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).toHaveBeenCalledWith(mockDb, 1, expect.any(Date));
    const cursor = vi.mocked(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).mock.calls[0]![2] as Date;
    expect(cursor.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(cursor.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("does not move the cursor when the provider returns null (not configured for this check)", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockResolvedValue(null);

    await pollBounces(mockDb);

    expect(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).not.toHaveBeenCalled();
    expect(
      workflowRunRepo.getRunStepByProviderMessageId,
    ).not.toHaveBeenCalled();
  });

  it("does not move the cursor when the poll itself fails", async () => {
    vi.mocked(environmentIntegrationsRepo.listAll).mockResolvedValue([
      fakeIntegration,
    ] as any);
    checkBounces.mockRejectedValue(new Error("Cloudflare API down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await pollBounces(mockDb);

    expect(
      environmentIntegrationsRepo.updateLastBounceCheckAt,
    ).not.toHaveBeenCalled();
  });
});
