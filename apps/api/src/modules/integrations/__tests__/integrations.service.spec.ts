import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import { verifySmtpConnection } from "@subscriber.dev/email";

import { encrypt } from "../../../common/encryption.js";
import { IntegrationsService } from "../integrations.service.js";

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  getByEnvironmentAndType: vi.fn(),
  listByEnvironment: vi.fn(),
  upsertIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
}));

vi.mock("@subscriber.dev/email", () => ({
  verifySmtpConnection: vi.fn(),
}));

vi.mock("../../../common/encryption.js", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted-blob"),
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
