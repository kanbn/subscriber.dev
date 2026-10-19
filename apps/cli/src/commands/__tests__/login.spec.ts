import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { signOut } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { registerLoginCommand } from "../login.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  signOut: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: () => ({ on: () => ({ unref: () => undefined }) }),
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

function mockDeviceFlow() {
  const responses = [
    {
      device_code: "device_1",
      user_code: "ABCD1234",
      verification_uri: "http://app/auth",
      verification_uri_complete: "http://app/auth?code=ABCD1234",
      interval: 0,
    },
    { error: "authorization_pending" },
    { access_token: "session_token" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      const body = responses.shift();
      return Promise.resolve({
        ok: !(body && "error" in body),
        json: () => Promise.resolve(body),
      });
    }),
  );
}

describe("login", () => {
  it("stores the session token and base URL", async () => {
    mockDeviceFlow();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["login", "--base-url", "http://localhost:4000"],
      { from: "user" },
    );

    expect(updateCliConfig).toHaveBeenCalledWith({
      token: "session_token",
      apiBaseUrl: "http://localhost:4000",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Logged in. API base URL set to http://localhost:4000",
    );
  });

  it("defaults the base URL to the production API", async () => {
    mockDeviceFlow();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["login"], { from: "user" });

    expect(updateCliConfig).toHaveBeenCalledWith({
      token: "session_token",
      apiBaseUrl: "https://api.subscriber.dev",
    });
  });
});

describe("logout", () => {
  it("signs out, then clears the token", async () => {
    vi.mocked(readCliConfig).mockReturnValue({ token: "session_token" });
    vi.mocked(signOut).mockResolvedValue({ status: 204 } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["logout"], { from: "user" });

    expect(signOut).toHaveBeenCalledOnce();
    expect(updateCliConfig).toHaveBeenCalledWith({ token: undefined });
    expect(logSpy).toHaveBeenCalledWith("Logged out.");
  });

  it("still clears the token when the API can't be reached", async () => {
    vi.mocked(readCliConfig).mockReturnValue({ token: "session_token" });
    vi.mocked(signOut).mockRejectedValue(new Error("offline"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["logout"], { from: "user" });

    expect(updateCliConfig).toHaveBeenCalledWith({ token: undefined });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("couldn't reach the API"),
    );
  });
});

describe("whoami", () => {
  it("reports loggedIn: true and the stored config", async () => {
    vi.mocked(readCliConfig).mockReturnValue({
      token: "session_token",
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

  it("reports loggedIn: false when there is no stored session", async () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["whoami", "--json"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"loggedIn": false'),
    );
  });
});
