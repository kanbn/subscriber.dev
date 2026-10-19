import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentKeyScope } from "@subscriber.dev/shared/environmentKeys";
import * as environmentKeyRepo from "@subscriber.dev/db/repository/environmentKey.repo";
import { ALL_ENVIRONMENT_KEY_SCOPES } from "@subscriber.dev/shared/environmentKeys";

import { hashEnvironmentKey, REQUIRED_SCOPE } from "../../environmentKey.js";
import { AuthGuard } from "../auth.guard.js";
import { resolveSessionFromHeaders } from "../session.util.js";

vi.mock("@subscriber.dev/db/repository/environmentKey.repo", () => ({
  getEnvironmentKeyByHash: vi.fn(),
  markEnvironmentKeyUsed: vi.fn(() => Promise.resolve()),
}));

vi.mock("../session.util.js", () => ({
  getAuth: () => ({ db: {}, auth: {} }),
  headersFromRaw: () => new Headers(),
  resolveSessionFromHeaders: vi.fn(),
}));

const routes = {
  trigger: () => undefined,
  editWorkflows: () => undefined,
  people: () => undefined,
};
Reflect.defineMetadata(REQUIRED_SCOPE, "workflows:trigger", routes.trigger);
Reflect.defineMetadata(REQUIRED_SCOPE, "workflows:write", routes.editWorkflows);

const environment = {
  id: 10,
  publicId: "env_1",
  workspaceId: 5,
  name: "Production",
  slug: "production",
};

function key(scopes: EnvironmentKeyScope[], lastUsedAt: Date | null = null) {
  return {
    id: 1,
    scopes,
    lastUsedAt,
    environment,
    workspacePublicId: "ws_1",
  };
}

function call(route: keyof typeof routes, headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => routes[route],
    getClass: () => Object,
  } as unknown as ExecutionContext;
  return {
    request,
    result: new AuthGuard(new Reflector()).canActivate(context),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthGuard with an environment key", () => {
  it("looks the key up by its hash and attaches it, with no user", async () => {
    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      key(["workflows:trigger"]),
    );

    const { request, result } = call("trigger", { "x-api-key": "sk_env_abc" });

    await expect(result).resolves.toBe(true);
    expect(environmentKeyRepo.getEnvironmentKeyByHash).toHaveBeenCalledWith(
      {},
      hashEnvironmentKey("sk_env_abc"),
    );
    expect(request.environmentKey).toEqual(key(["workflows:trigger"]));
    expect(request.user).toBeNull();
    expect(resolveSessionFromHeaders).not.toHaveBeenCalled();
    expect(environmentKeyRepo.markEnvironmentKeyUsed).toHaveBeenCalled();
  });

  it("rejects a key that doesn't exist", async () => {
    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      undefined,
    );

    await expect(
      call("trigger", { "x-api-key": "sk_env_revoked" }).result,
    ).rejects.toThrow(UnauthorizedException);
  });

  it("needs the route's scope", async () => {
    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      key(ALL_ENVIRONMENT_KEY_SCOPES),
    );
    await expect(
      call("editWorkflows", { "x-api-key": "sk_env_full" }).result,
    ).resolves.toBe(true);

    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      key(["workflows:trigger"]),
    );
    await expect(
      call("editWorkflows", { "x-api-key": "sk_env_app" }).result,
    ).rejects.toThrow("doesn't have the workflows:write scope");
  });

  it("rejects any key on routes without a scope", async () => {
    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      key(ALL_ENVIRONMENT_KEY_SCOPES),
    );

    await expect(
      call("people", { "x-api-key": "sk_env_full" }).result,
    ).rejects.toThrow(ForbiddenException);
  });

  it("doesn't record use again within a minute", async () => {
    vi.mocked(environmentKeyRepo.getEnvironmentKeyByHash).mockResolvedValue(
      key(["workflows:trigger"], new Date()),
    );

    await call("trigger", { "x-api-key": "sk_env_abc" }).result;

    expect(environmentKeyRepo.markEnvironmentKeyUsed).not.toHaveBeenCalled();
  });
});

describe("AuthGuard without an environment key", () => {
  it("signs in with the session, as before", async () => {
    const user = { id: 1, email: "henry@acme.com" };
    vi.mocked(resolveSessionFromHeaders).mockResolvedValue({
      user,
      db: {},
      auth: {},
    } as never);

    const { request, result } = call("people", { "x-api-key": "personal" });

    await expect(result).resolves.toBe(true);
    expect(request.user).toBe(user);
    expect(environmentKeyRepo.getEnvironmentKeyByHash).not.toHaveBeenCalled();
  });
});
