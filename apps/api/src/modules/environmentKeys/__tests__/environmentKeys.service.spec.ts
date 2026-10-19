import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentKeyRepo from "@subscriber.dev/db/repository/environmentKey.repo";
import { ALL_ENVIRONMENT_KEY_SCOPES } from "@subscriber.dev/shared/environmentKeys";

import { hashEnvironmentKey } from "../../../common/environmentKey.js";
import { EnvironmentKeysService } from "../environmentKeys.service.js";

vi.mock("@subscriber.dev/db/repository/environmentKey.repo", () => ({
  createEnvironmentKey: vi.fn((_db: unknown, data: Record<string, unknown>) =>
    Promise.resolve({
      ...data,
      publicId: "key_1",
      lastUsedAt: null,
      createdAt: new Date("2026-10-19T00:00:00Z"),
    }),
  ),
  deleteEnvironmentKey: vi.fn(),
}));

const db = {} as dbClient;
const service = new EnvironmentKeysService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EnvironmentKeysService.create", () => {
  it("defaults to limited, stores only the hash and returns the key once", async () => {
    const created = await service.create(db, 10, { name: "App" }, 1);

    expect(created.key).toMatch(/^sk_env_/);
    expect(created.scopes).toEqual(["workflows:trigger", "subscribers:write"]);
    expect(environmentKeyRepo.createEnvironmentKey).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        environmentId: 10,
        keyHash: hashEnvironmentKey(created.key),
        start: created.key.slice(0, 12),
        createdBy: 1,
      }),
    );
    expect(environmentKeyRepo.createEnvironmentKey).not.toHaveBeenCalledWith(
      db,
      expect.objectContaining({ key: created.key }),
    );
  });

  it("uses the full preset or the scopes given", async () => {
    const full = await service.create(
      db,
      10,
      { name: "CI", access: "full" },
      1,
    );
    expect(full.scopes).toEqual(ALL_ENVIRONMENT_KEY_SCOPES);

    const custom = await service.create(
      db,
      10,
      { name: "Reader", scopes: ["subscribers:read"] },
      1,
    );
    expect(custom.scopes).toEqual(["subscribers:read"]);
  });

  it("rejects access and scopes together", async () => {
    await expect(
      service.create(
        db,
        10,
        { name: "App", access: "full", scopes: ["subscribers:read"] },
        1,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("EnvironmentKeysService.revoke", () => {
  it("404s when the key isn't in this environment", async () => {
    vi.mocked(environmentKeyRepo.deleteEnvironmentKey).mockResolvedValue(false);

    await expect(service.revoke(db, 10, "key_other")).rejects.toThrow(
      NotFoundException,
    );
  });
});
