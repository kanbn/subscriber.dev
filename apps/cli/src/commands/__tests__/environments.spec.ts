import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listEnvironments } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { registerEnvironmentsCommand } from "../environments.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listEnvironments: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
  updateCliConfig: vi.fn(),
}));

const testEnvironment = {
  id: 1,
  publicId: "test-environment-1",
  name: "Production",
  slug: "prod",
};

function buildProgram() {
  const program = new Command();
  registerEnvironmentsCommand(program);
  return program;
}

describe("environments list", () => {
  beforeEach(() => {
    vi.mocked(readCliConfig).mockReturnValue({ apiKey: "test-key" });
  });

  it("uses the --workspace flag when passed", async () => {
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [testEnvironment] },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["environments", "list", "--workspace", "explicit-workspace"],
      { from: "user" },
    );

    expect(listEnvironments).toHaveBeenCalledWith("explicit-workspace");
  });

  it("falls back to the stored current workspace", async () => {
    vi.mocked(readCliConfig).mockReturnValue({
      apiKey: "test-key",
      currentWorkspaceId: "stored-workspace",
    });
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [testEnvironment] },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["environments", "list"], {
      from: "user",
    });

    expect(listEnvironments).toHaveBeenCalledWith("stored-workspace");
  });

  it("prints an error and exits when the workspace isn't found", async () => {
    vi.mocked(readCliConfig).mockReturnValue({
      apiKey: "test-key",
      currentWorkspaceId: "stored-workspace",
    });
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["environments", "list"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Workspace not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });

  it("exits before calling the API when no workspace can be resolved", async () => {
    vi.mocked(readCliConfig).mockReturnValue({ apiKey: "test-key" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["environments", "list"], {
      from: "user",
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(listEnvironments).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});

describe("environments use", () => {
  it("stores the environment ID", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["environments", "use", "test-environment-1"],
      { from: "user" },
    );

    expect(updateCliConfig).toHaveBeenCalledWith({
      currentEnvironmentId: "test-environment-1",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Current environment set to test-environment-1.",
    );
  });

  it("also stores the workspace ID when --workspace is passed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "environments",
        "use",
        "test-environment-1",
        "--workspace",
        "test-workspace-1",
      ],
      { from: "user" },
    );

    expect(updateCliConfig).toHaveBeenCalledWith({
      currentEnvironmentId: "test-environment-1",
      currentWorkspaceId: "test-workspace-1",
    });
  });
});
