import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspace, getWorkspaces } from "@subscriber.dev/api-client/cli";
import { readCliConfig, updateCliConfig } from "@subscriber.dev/shared";

import { registerWorkspacesCommand } from "../workspaces.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
  updateCliConfig: vi.fn(),
}));

const testWorkspace = {
  id: 1,
  publicId: "test-workspace-1",
  name: "Test Workspace",
  slug: "test-workspace",
};

describe("workspaces list", () => {
  beforeEach(() => {
    vi.mocked(readCliConfig).mockReturnValue({ token: "test-token" });
  });

  it("prints workspaces as JSON with --json", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const program = new Command();
    registerWorkspacesCommand(program);
    await program.parseAsync(["workspaces", "list", "--json"], {
      from: "user",
    });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify([testWorkspace], null, 2),
    );

    logSpy.mockRestore();
  });

  it("exits with an error and does not call the API when not logged in", async () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    // process.exit() halts execution for real; make the mock do the same
    // (by throwing) so the handler doesn't fall through to the API call.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const program = new Command();
    registerWorkspacesCommand(program);
    await program.parseAsync(["workspaces", "list"], { from: "user" });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(getWorkspaces).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});

describe("workspaces create", () => {
  beforeEach(() => {
    vi.mocked(readCliConfig).mockReturnValue({ token: "test-token" });
  });

  it("creates a workspace with the given name", async () => {
    vi.mocked(createWorkspace).mockResolvedValue({
      status: 201,
      headers: new Headers(),
      data: {
        workspace: testWorkspace,
        environment: {
          id: 1,
          publicId: "test-environment-1",
          name: "Production",
          slug: "prod",
        },
      },
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const program = new Command();
    registerWorkspacesCommand(program);
    await program.parseAsync(["workspaces", "create", "Test Workspace"], {
      from: "user",
    });

    expect(createWorkspace).toHaveBeenCalledWith({ name: "Test Workspace" });
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("workspaces use", () => {
  it("stores the workspace ID and clears the current environment", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const program = new Command();
    registerWorkspacesCommand(program);
    await program.parseAsync(["workspaces", "use", "test-workspace-1"], {
      from: "user",
    });

    expect(updateCliConfig).toHaveBeenCalledWith({
      currentWorkspaceId: "test-workspace-1",
      currentEnvironmentId: undefined,
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Current workspace set to test-workspace-1.",
    );
  });
});
