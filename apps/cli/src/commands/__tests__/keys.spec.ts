import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEnvironmentKey,
  revokeEnvironmentKey,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerKeysCommand } from "../keys.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  createEnvironmentKey: vi.fn(),
  listEnvironmentKeys: vi.fn(),
  revokeEnvironmentKey: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

function buildProgram() {
  const program = new Command().exitOverride();
  registerKeysCommand(program);
  return program;
}

const created = {
  status: 201,
  headers: new Headers(),
  data: {
    publicId: "key_1",
    name: "App",
    start: "sk_env_abcde",
    scopes: ["workflows:trigger", "subscribers:write"],
    lastUsedAt: null,
    createdAt: "2026-10-19T00:00:00.000Z",
    key: "sk_env_secret",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCliConfig).mockReturnValue({
    token: "test-token",
    currentEnvironmentId: "env_1",
  });
  process.exitCode = undefined;
});

describe("keys create", () => {
  it("creates a limited key by default and prints only the key to stdout", async () => {
    vi.mocked(createEnvironmentKey).mockResolvedValue(created as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["keys", "create", "App"], {
      from: "user",
    });

    expect(createEnvironmentKey).toHaveBeenCalledWith("env_1", {
      name: "App",
      access: "limited",
    });
    expect(logSpy).toHaveBeenCalledWith("sk_env_secret");
  });

  it("sends the scopes given instead", async () => {
    vi.mocked(createEnvironmentKey).mockResolvedValue(created as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "keys",
        "create",
        "Reader",
        "--scope",
        "subscribers:read",
        "workflows:read",
      ],
      { from: "user" },
    );

    expect(createEnvironmentKey).toHaveBeenCalledWith("env_1", {
      name: "Reader",
      scopes: ["subscribers:read", "workflows:read"],
    });
  });

  it("refuses --access with --scope", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(
      buildProgram().parseAsync(
        [
          "keys",
          "create",
          "App",
          "--access",
          "full",
          "--scope",
          "billing:read",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow();
    expect(createEnvironmentKey).not.toHaveBeenCalled();
  });
});

describe("keys revoke", () => {
  it("fails when the key isn't found", async () => {
    vi.mocked(revokeEnvironmentKey).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["keys", "revoke", "key_missing"], {
      from: "user",
    });

    expect(revokeEnvironmentKey).toHaveBeenCalledWith("env_1", "key_missing");
    expect(process.exitCode).toBe(1);
  });
});
