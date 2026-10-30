import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import { verifySmtpConnection } from "@subscriber.dev/email";

import { decrypt, encrypt } from "../../../common/encryption.js";
import { IntegrationsService } from "../integrations.service.js";

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  getByEnvironmentAndType: vi.fn(),
  listByEnvironment: vi.fn(),
  upsertIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  setPrimary: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workflow.repo", () => ({
  countTriggersForSource: vi.fn(),
}));

vi.mock("@subscriber.dev/email", () => ({
  verifySmtpConnection: vi.fn(),
}));

const stripeWebhookEndpoints = {
  list: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
};

vi.mock("@subscriber.dev/stripe", () => ({
  STRIPE_API_VERSION: "2026-09-30.endive",
  createStripeClientForKey: vi.fn(() => ({
    customers: { list: vi.fn().mockResolvedValue({ data: [] }) },
    webhookEndpoints: stripeWebhookEndpoints,
  })),
}));

vi.mock("../../../common/encryption.js", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted-blob"),
  decrypt: vi.fn(),
}));

const mockDb = {} as dbClient;

const validSmtpBody = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  user: "user@example.com",
  password: "s3cret",
  fromEmail: "hello@example.com",
  fromName: "Example",
};

let service: IntegrationsService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySmtpConnection).mockResolvedValue(undefined as any);
  vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue(
    [],
  );
  service = new IntegrationsService();
});

describe("upsert", () => {
  it("throws NotFoundException for an unregistered integration type", async () => {
    await expect(service.upsert(mockDb, 10, "slack", {}, 1)).rejects.toThrow(
      NotFoundException,
    );
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when required config fields are missing", async () => {
    await expect(
      service.upsert(mockDb, 10, "smtp", { port: 587 }, 1),
    ).rejects.toThrow(BadRequestException);
    expect(verifySmtpConnection).not.toHaveBeenCalled();
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when the secret is missing", async () => {
    const { password, ...withoutPassword } = validSmtpBody;
    await expect(
      service.upsert(mockDb, 10, "smtp", withoutPassword, 1),
    ).rejects.toThrow(BadRequestException);
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when user is missing (it's a secret, not config)", async () => {
    const { user, ...withoutUser } = validSmtpBody;
    await expect(
      service.upsert(mockDb, 10, "smtp", withoutUser, 1),
    ).rejects.toThrow(BadRequestException);
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("throws BadRequestException and doesn't save when live verification fails", async () => {
    vi.mocked(verifySmtpConnection).mockRejectedValue(
      new Error("Invalid login"),
    );

    await expect(
      service.upsert(mockDb, 10, "smtp", validSmtpBody, 1),
    ).rejects.toThrow("Invalid login");
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("verifies, encrypts the secret, and saves on success - never returning user or password", async () => {
    vi.mocked(environmentIntegrationsRepo.upsertIntegration).mockResolvedValue({
      id: 1,
      environmentId: 10,
      type: "smtp",
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        fromEmail: "hello@example.com",
        fromName: "Example",
      },
      encryptedSecret: "encrypted-blob",
      priority: 1,
      updatedAt: new Date("2026-01-01"),
    } as any);

    const result = await service.upsert(mockDb, 10, "smtp", validSmtpBody, 1);

    expect(verifySmtpConnection).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "user@example.com",
      password: "s3cret",
    });
    expect(encrypt).toHaveBeenCalledWith(
      JSON.stringify({ user: "user@example.com", password: "s3cret" }),
    );
    expect(environmentIntegrationsRepo.upsertIntegration).toHaveBeenCalledWith(
      mockDb,
      10,
      "smtp",
      expect.objectContaining({ host: "smtp.example.com" }),
      "encrypted-blob",
      1,
      1,
    );
    const [, , , savedConfig] = vi.mocked(
      environmentIntegrationsRepo.upsertIntegration,
    ).mock.calls[0]!;
    expect(savedConfig).not.toHaveProperty("user");
    expect(savedConfig).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("password");
    expect(result).toEqual(
      expect.objectContaining({ type: "smtp", host: "smtp.example.com" }),
    );
  });

  describe("updating an existing integration", () => {
    const { user, password, ...configOnly } = validSmtpBody;

    beforeEach(() => {
      vi.mocked(
        environmentIntegrationsRepo.getByEnvironmentAndType,
      ).mockResolvedValue({
        type: "smtp",
        config: configOnly,
        encryptedSecret: "stored-blob",
        priority: 1,
      } as any);
      vi.mocked(decrypt).mockReturnValue(
        JSON.stringify({ user: "stored-user", password: "stored-pass" }),
      );
      vi.mocked(
        environmentIntegrationsRepo.upsertIntegration,
      ).mockResolvedValue({
        type: "smtp",
        config: configOnly,
        priority: 1,
        updatedAt: new Date("2026-01-01"),
      } as any);
    });

    it("keeps the stored secret when the update leaves it out", async () => {
      await service.upsert(
        mockDb,
        10,
        "smtp",
        { ...configOnly, replyTo: "henry@kan.bn" },
        1,
      );

      expect(decrypt).toHaveBeenCalledWith("stored-blob");
      expect(verifySmtpConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          user: "stored-user",
          password: "stored-pass",
        }),
      );
      expect(encrypt).toHaveBeenCalledWith(
        JSON.stringify({ user: "stored-user", password: "stored-pass" }),
      );
      const [, , , savedConfig] = vi.mocked(
        environmentIntegrationsRepo.upsertIntegration,
      ).mock.calls[0]!;
      expect(savedConfig).toEqual(
        expect.objectContaining({ replyTo: "henry@kan.bn" }),
      );
    });

    it("replaces just the secret fields that are given", async () => {
      await service.upsert(
        mockDb,
        10,
        "smtp",
        { ...configOnly, password: "new-pass" },
        1,
      );

      expect(encrypt).toHaveBeenCalledWith(
        JSON.stringify({ user: "stored-user", password: "new-pass" }),
      );
    });

    it("still refuses to save if the kept credentials no longer verify", async () => {
      vi.mocked(verifySmtpConnection).mockRejectedValue(
        new Error("Invalid login"),
      );

      await expect(
        service.upsert(mockDb, 10, "smtp", configOnly, 1),
      ).rejects.toThrow("Invalid login");
      expect(
        environmentIntegrationsRepo.upsertIntegration,
      ).not.toHaveBeenCalled();
    });
  });

  it("appends new integrations to the end of the existing failover order", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      { type: "cloudflare", priority: 1 },
      { type: "ses", priority: 2 },
    ] as any);
    vi.mocked(environmentIntegrationsRepo.upsertIntegration).mockResolvedValue({
      type: "smtp",
      config: {},
      priority: 3,
      updatedAt: new Date("2026-01-01"),
    } as any);

    await service.upsert(mockDb, 10, "smtp", validSmtpBody, 1);

    expect(environmentIntegrationsRepo.upsertIntegration).toHaveBeenCalledWith(
      mockDb,
      10,
      "smtp",
      expect.anything(),
      expect.anything(),
      1,
      3,
    );
  });
});

describe("setPrimary", () => {
  it("delegates to the repo and returns the sanitized result", async () => {
    vi.mocked(environmentIntegrationsRepo.setPrimary).mockResolvedValue({
      type: "ses",
      config: { fromEmail: "hello@example.com" },
      priority: 1,
      updatedAt: new Date("2026-01-01"),
    } as any);

    const result = await service.setPrimary(mockDb, 10, "ses");

    expect(environmentIntegrationsRepo.setPrimary).toHaveBeenCalledWith(
      mockDb,
      10,
      "ses",
    );
    expect(result).toEqual(
      expect.objectContaining({ type: "ses", priority: 1 }),
    );
  });

  it("throws NotFoundException when the type isn't configured", async () => {
    vi.mocked(environmentIntegrationsRepo.setPrimary).mockResolvedValue(
      undefined,
    );

    await expect(service.setPrimary(mockDb, 10, "ses")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("get", () => {
  it("returns the sanitized integration", async () => {
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue({
      type: "smtp",
      config: { host: "smtp.example.com" },
      encryptedSecret: "encrypted-blob",
      updatedAt: new Date("2026-01-01"),
    } as any);

    const result = await service.get(mockDb, 10, "smtp");

    expect(result).toEqual(
      expect.objectContaining({ type: "smtp", host: "smtp.example.com" }),
    );
    expect(result).not.toHaveProperty("encryptedSecret");
    expect(result).not.toHaveProperty("triggerCount");
  });

  it("says how many workflow triggers use an integration that offers them", async () => {
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue({
      type: "stripe",
      config: { webhookToken: "tok" },
      encryptedSecret: "encrypted-blob",
      updatedAt: new Date("2026-01-01"),
    } as any);
    vi.mocked(workflowRepo.countTriggersForSource).mockResolvedValue(3);

    const result = await service.get(mockDb, 10, "stripe");

    expect(result).toEqual(expect.objectContaining({ triggerCount: 3 }));
    expect(workflowRepo.countTriggersForSource).toHaveBeenCalledWith(
      mockDb,
      10,
      "stripe",
    );
  });

  it("throws NotFoundException when not configured", async () => {
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue(undefined);

    await expect(service.get(mockDb, 10, "smtp")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("list", () => {
  it("returns every configured integration, sanitized", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "smtp",
        config: { host: "smtp.example.com" },
        encryptedSecret: "x",
        updatedAt: new Date(),
      },
    ] as any);

    const result = await service.list(mockDb, 10);

    expect(result.integrations).toHaveLength(1);
    expect(result.integrations[0]).not.toHaveProperty("encryptedSecret");
  });
});

describe("delete", () => {
  it("resolves when an integration was deleted", async () => {
    vi.mocked(environmentIntegrationsRepo.deleteIntegration).mockResolvedValue({
      type: "smtp",
    } as any);

    await expect(service.delete(mockDb, 10, "smtp")).resolves.not.toThrow();
  });

  it("throws NotFoundException when nothing was configured", async () => {
    vi.mocked(environmentIntegrationsRepo.deleteIntegration).mockResolvedValue(
      undefined,
    );

    await expect(service.delete(mockDb, 10, "smtp")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("stripe integration", () => {
  it("keeps the webhook token across updates and returns the webhook URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue({
      type: "stripe",
      config: { webhookToken: "existing-token" },
      encryptedSecret: "stored-blob",
      priority: 2,
    } as any);
    vi.mocked(decrypt).mockReturnValue(JSON.stringify({ apiKey: "rk_1" }));
    stripeWebhookEndpoints.list.mockResolvedValue({ data: [] });
    stripeWebhookEndpoints.create.mockResolvedValue({
      id: "we_1",
      secret: "whsec_created",
    });
    vi.mocked(environmentIntegrationsRepo.upsertIntegration).mockImplementation(
      async (_db, _env, type, config) =>
        ({ type, config, priority: 2, updatedAt: new Date(0) }) as any,
    );

    const result = await service.upsert(
      mockDb,
      10,
      "stripe",
      { webhookToken: "forged" },
      1,
    );
    vi.unstubAllEnvs();

    const [, , , savedConfig] = vi.mocked(
      environmentIntegrationsRepo.upsertIntegration,
    ).mock.calls[0]!;
    expect(savedConfig).toEqual({
      webhookToken: "existing-token",
      webhookEndpointId: "we_1",
      webhookStatus: "automatic",
    });
    expect(result).toEqual(
      expect.objectContaining({
        webhookUrl: "https://api.example.com/webhooks/stripe/existing-token",
      }),
    );
  });

  it("creates the Stripe webhook endpoint and saves its signing secret encrypted", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue(undefined);
    stripeWebhookEndpoints.list.mockResolvedValue({ data: [] });
    stripeWebhookEndpoints.create.mockResolvedValue({
      id: "we_1",
      secret: "whsec_created",
    });
    vi.mocked(environmentIntegrationsRepo.upsertIntegration).mockImplementation(
      async (_db, _env, type, config) =>
        ({ type, config, priority: 1, updatedAt: new Date(0) }) as any,
    );

    const result = await service.upsert(
      mockDb,
      10,
      "stripe",
      { apiKey: "rk_1" },
      1,
    );
    vi.unstubAllEnvs();

    expect(encrypt).toHaveBeenCalledWith(
      JSON.stringify({ apiKey: "rk_1", webhookSecret: "whsec_created" }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        webhookEndpointId: "we_1",
        webhookStatus: "automatic",
      }),
    );
    expect(result).not.toHaveProperty("nextStep");
    expect(JSON.stringify(result)).not.toContain("whsec_created");
  });

  it("refuses to save, saying why, when Stripe won't create the webhook", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue(undefined);
    stripeWebhookEndpoints.list.mockResolvedValue({ data: [] });
    stripeWebhookEndpoints.create.mockRejectedValue(new Error("Invalid URL"));

    await expect(
      service.upsert(mockDb, 10, "stripe", { apiKey: "rk_1" }, 1),
    ).rejects.toThrow(BadRequestException);
    vi.unstubAllEnvs();
    expect(
      environmentIntegrationsRepo.upsertIntegration,
    ).not.toHaveBeenCalled();
  });

  it("deletes the Stripe webhook endpoint with the integration", async () => {
    vi.mocked(environmentIntegrationsRepo.deleteIntegration).mockResolvedValue({
      type: "stripe",
      config: { webhookToken: "tok", webhookEndpointId: "we_1" },
      encryptedSecret: "stored-blob",
    } as any);
    vi.mocked(decrypt).mockReturnValue(JSON.stringify({ apiKey: "rk_1" }));

    await service.delete(mockDb, 10, "stripe");

    expect(stripeWebhookEndpoints.del).toHaveBeenCalledWith("we_1");
  });

  it("still deletes the integration when Stripe won't delete the endpoint", async () => {
    vi.mocked(environmentIntegrationsRepo.deleteIntegration).mockResolvedValue({
      type: "stripe",
      config: { webhookEndpointId: "we_1" },
      encryptedSecret: "stored-blob",
    } as any);
    vi.mocked(decrypt).mockReturnValue(
      JSON.stringify({ apiKey: "rk_revoked" }),
    );
    stripeWebhookEndpoints.del.mockRejectedValue(new Error("invalid api key"));

    await expect(service.delete(mockDb, 10, "stripe")).resolves.toBeUndefined();
  });
});
