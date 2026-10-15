import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { revokeCurrentApiKey } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { registerLoginCommand } from "../login.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  revokeCurrentApiKey: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
  updateCliConfig: vi.fn(),
}));

function buildProgram() {
  const program = new Command();
  registerLoginCommand(program);
  return program;
}

describe("login", () => {
  it("stores the API key and base URL", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "login",
        "--api-key",
        "sub_test_key",
        "--base-url",
        "http://localhost:4000",
      ],
      { from: "user" },
    );

    expect(updateCliConfig).toHaveBeenCalledWith({
      apiKey: "sub_test_key",
      apiBaseUrl: "http://localhost:4000",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Logged in. API base URL set to http://localhost:4000",
    );
  });

  it("defaults the base URL to the production API", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["login", "--api-key", "sub_test_key"], {
      from: "user",
    });

    expect(updateCliConfig).toHaveBeenCalledWith({
      apiKey: "sub_test_key",
      apiBaseUrl: "https://api.subscriber.dev",
    });
  });
});

describe("logout", () => {
  it("revokes the API key, then clears it", async () => {
    vi.mocked(readCliConfig).mockReturnValue({ apiKey: "sub_test_key" });
    vi.mocked(revokeCurrentApiKey).mockResolvedValue({ status: 204 } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["logout"], { from: "user" });

    expect(revokeCurrentApiKey).toHaveBeenCalledOnce();
    expect(updateCliConfig).toHaveBeenCalledWith({ apiKey: undefined });
    expect(logSpy).toHaveBeenCalledWith("Logged out.");
  });

  it("still clears the key when the API can't be reached", async () => {
    vi.mocked(readCliConfig).mockReturnValue({ apiKey: "sub_test_key" });
    vi.mocked(revokeCurrentApiKey).mockRejectedValue(new Error("offline"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["logout"], { from: "user" });

    expect(updateCliConfig).toHaveBeenCalledWith({ apiKey: undefined });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("couldn't reach the API"),
    );
  });
});

describe("whoami", () => {
  it("reports loggedIn: true and the stored config", async () => {
    vi.mocked(readCliConfig).mockReturnValue({
      apiKey: "sub_test_key",
      apiBaseUrl: "https://api.subscriber.dev",
      currentWorkspaceId: "test-workspace-1",
      currentEnvironmentId: "test-environment-1",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["whoami", "--json"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          loggedIn: true,
          apiBaseUrl: "https://api.subscriber.dev",
          currentWorkspaceId: "test-workspace-1",
          currentEnvironmentId: "test-environment-1",
        },
        null,
        2,
      ),
    );
  });

  it("reports loggedIn: false when there is no stored API key", async () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["whoami", "--json"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"loggedIn": false'),
    );
  });
});
