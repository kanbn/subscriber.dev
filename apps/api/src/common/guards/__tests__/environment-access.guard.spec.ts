import { ExecutionContext, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { EnvironmentAccessGuard } from "../environment-access.guard.js";

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getEnvironmentForUser: vi.fn(),
}));

const mockUser = { id: 1, email: "user@example.com" };
const mockDb = {};
const mockEnvironment = { id: 10, publicId: "env_abc" };

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

describe("EnvironmentAccessGuard", () => {
  it("attaches the resolved environment to the request and allows the call through", async () => {
    vi.mocked(subscriberRepo.getEnvironmentForUser).mockResolvedValue(
      mockEnvironment as any,
    );

    const request: Record<string, unknown> = {
      params: { environmentId: "env_abc" },
      user: mockUser,
      db: mockDb,
    };

    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(request.environment).toBe(mockEnvironment);
    expect(subscriberRepo.getEnvironmentForUser).toHaveBeenCalledWith(
      mockDb,
      mockUser.id,
      "env_abc",
    );
  });

  it("throws NotFoundException when the user doesn't have access to the environment", async () => {
    vi.mocked(subscriberRepo.getEnvironmentForUser).mockResolvedValue(
      undefined,
    );

    const request: Record<string, unknown> = {
      params: { environmentId: "env_other_tenant" },
      user: mockUser,
      db: mockDb,
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws NotFoundException when the route has no environmentId param", async () => {
    const request: Record<string, unknown> = {
      params: {},
      user: mockUser,
      db: mockDb,
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      NotFoundException,
    );
    expect(subscriberRepo.getEnvironmentForUser).not.toHaveBeenCalled();
  });
});
