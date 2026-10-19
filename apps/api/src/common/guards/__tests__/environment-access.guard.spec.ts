import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { EnvironmentAccessGuard } from "../environment-access.guard.js";

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentForUser: vi.fn(),
}));

const mockUser = { id: 1, email: "user@example.com" };
const mockDb = {};
const mockEnvironment = {
  id: 10,
  publicId: "env_abc",
  workspaceId: 5,
  name: "Production",
  slug: "production",
};

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

let guard: EnvironmentAccessGuard;

beforeEach(() => {
  vi.clearAllMocks();
  guard = new EnvironmentAccessGuard();
});

describe("EnvironmentAccessGuard with a session", () => {
  it("uses the environment in the x-environment-id header", async () => {
    vi.mocked(subscriberRepo.getEnvironmentForUser).mockResolvedValue(
      mockEnvironment,
    );

    const request: Record<string, unknown> = {
      headers: { "x-environment-id": "env_abc" },
      user: mockUser,
      db: mockDb,
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.environment).toBe(mockEnvironment);
    expect(subscriberRepo.getEnvironmentForUser).toHaveBeenCalledWith(
      mockDb,
      mockUser.id,
      "env_abc",
    );
  });

  it("404s when the user isn't a member of the environment", async () => {
    vi.mocked(subscriberRepo.getEnvironmentForUser).mockResolvedValue(
      undefined,
    );

    await expect(
      guard.canActivate(
        makeContext({
          headers: { "x-environment-id": "env_other_tenant" },
          user: mockUser,
          db: mockDb,
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("asks for the header when it's missing", async () => {
    await expect(
      guard.canActivate(
        makeContext({ headers: {}, user: mockUser, db: mockDb }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(subscriberRepo.getEnvironmentForUser).not.toHaveBeenCalled();
  });
});

describe("EnvironmentAccessGuard with an environment key", () => {
  const environmentKey = { environment: mockEnvironment };

  it("uses the key's environment, with or without the header", async () => {
    for (const headers of [{}, { "x-environment-id": "env_abc" }]) {
      const request: Record<string, unknown> = {
        headers,
        user: null,
        environmentKey,
        db: mockDb,
      };
      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.environment).toBe(mockEnvironment);
    }
    expect(subscriberRepo.getEnvironmentForUser).not.toHaveBeenCalled();
  });

  it("404s when the header names another environment", async () => {
    await expect(
      guard.canActivate(
        makeContext({
          headers: { "x-environment-id": "env_other" },
          user: null,
          environmentKey,
          db: mockDb,
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
