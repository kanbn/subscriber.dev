import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  updateCurrentUser,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerUsersCommand } from "../users.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getCurrentUser: vi.fn(),
  updateCurrentUser: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

const testUser = {
  publicId: "test-user-1",
  name: "Test User",
  email: "test@example.com",
  image: null,
  apiKeys: [],
};

function buildProgram() {
  const program = new Command();
  registerUsersCommand(program);
  return program;
}

beforeEach(() => {
  vi.mocked(readCliConfig).mockReturnValue({ apiKey: "test-key" });
});

describe("users get", () => {
  it("prints the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testUser,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["users", "get"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(testUser);
  });
});

describe("users update", () => {
  it("only includes the fields that were passed", async () => {
    vi.mocked(updateCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testUser, name: "Updated" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["users", "update", "--name", "Updated"], {
      from: "user",
    });

    expect(updateCurrentUser).toHaveBeenCalledWith({ name: "Updated" });
  });

  it("errors without calling the API when no fields are passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["users", "update"], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No fields to update"),
    );
    expect(process.exitCode).toBe(1);
    expect(updateCurrentUser).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });
});
