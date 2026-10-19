import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectAgent } from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerAgentsCommand } from "../agents.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listAgents: vi.fn(),
  disconnectAgent: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

function buildProgram() {
  const program = new Command();
  registerAgentsCommand(program);
  return program;
}

beforeEach(() => {
  vi.mocked(readCliConfig).mockReturnValue({ token: "test-token" });
  process.exitCode = undefined;
});

describe("agents disconnect", () => {
  it("disconnects the agent", async () => {
    vi.mocked(disconnectAgent).mockResolvedValue({
      status: 204,
      headers: new Headers(),
      data: undefined,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["agents", "disconnect", "client-1"], {
      from: "user",
    });

    expect(disconnectAgent).toHaveBeenCalledWith("client-1");
    expect(logSpy).toHaveBeenCalledWith("Disconnected agent client-1.");
  });

  it("fails when the agent is not connected", async () => {
    vi.mocked(disconnectAgent).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["agents", "disconnect", "missing"], {
      from: "user",
    });

    expect(process.exitCode).toBe(1);
  });
});
