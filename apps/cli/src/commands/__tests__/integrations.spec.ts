import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteIntegration,
  getIntegration,
  listIntegrations,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerIntegrationsCommand } from "../integrations.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listIntegrations: vi.fn(),
  getIntegration: vi.fn(),
  upsertIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

const testIntegration = {
  type: "smtp",
  host: "smtp.example.com",
  port: 587,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildProgram() {
  const program = new Command();
  registerIntegrationsCommand(program);
  return program;
}

beforeEach(() => {
  vi.mocked(readCliConfig).mockReturnValue({
    apiKey: "test-key",
    currentEnvironmentId: "test-environment-1",
  });
});

describe("integrations list", () => {
  it("prints the configured integrations", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [testIntegration] },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["integrations", "list"], {
      from: "user",
    });

    expect(listIntegrations).toHaveBeenCalledWith("test-environment-1");
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["integrations", "list"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("integrations get", () => {
  it("prints the integration on success", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testIntegration,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["integrations", "get", "smtp"], {
      from: "user",
    });

    expect(getIntegration).toHaveBeenCalledWith("test-environment-1", "smtp");
    expect(logSpy).toHaveBeenCalledWith(testIntegration);
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["integrations", "get", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Environment or integration not found.",
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("integrations set", () => {
  it("sends the parsed JSON body", async () => {
    vi.mocked(upsertIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testIntegration,
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "integrations",
        "set",
        "smtp",
        "--body",
        '{"host":"smtp.example.com","port":587}',
      ],
      { from: "user" },
    );

    expect(upsertIntegration).toHaveBeenCalledWith(
      "test-environment-1",
      "smtp",
      { host: "smtp.example.com", port: 587 },
    );
  });

  it("errors without calling the API when --body isn't valid JSON", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["integrations", "set", "smtp", "--body", "not-json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("--body must be valid JSON.");
    expect(process.exitCode).toBe(1);
    expect(upsertIntegration).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 400", async () => {
    vi.mocked(upsertIntegration).mockResolvedValue({
      status: 400,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["integrations", "set", "smtp", "--body", "{}"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Invalid config or failed verification.",
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("integrations remove", () => {
  it("removes the integration and confirms", async () => {
    vi.mocked(deleteIntegration).mockResolvedValue({
      status: 204,
      headers: new Headers(),
      data: undefined,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["integrations", "remove", "smtp"], {
      from: "user",
    });

    expect(deleteIntegration).toHaveBeenCalledWith(
      "test-environment-1",
      "smtp",
    );
    expect(logSpy).toHaveBeenCalledWith('Removed integration "smtp".');
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(deleteIntegration).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["integrations", "remove", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Environment or integration not found.",
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
