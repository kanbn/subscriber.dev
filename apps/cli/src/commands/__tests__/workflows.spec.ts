import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWorkflow,
  listWorkflows,
  triggerWorkflow,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerWorkflowsCommand } from "../workflows.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

const testWorkflow = {
  publicId: "test-workflow-1",
  key: "test-signup",
  name: "Test Signup",
  description: null,
  status: "active" as const,
  steps: [
    {
      publicId: "test-step-1",
      stepOrder: 0,
      type: "email",
      delayMs: 0,
      subject: "Welcome",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildProgram() {
  const program = new Command();
  registerWorkflowsCommand(program);
  return program;
}

beforeEach(() => {
  vi.mocked(readCliConfig).mockReturnValue({
    apiKey: "test-key",
    currentEnvironmentId: "test-environment-1",
  });
});

describe("workflows list", () => {
  it("passes pagination params through", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [testWorkflow], limit: 10, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "list", "--limit", "10", "--offset", "5"],
      { from: "user" },
    );

    expect(listWorkflows).toHaveBeenCalledWith("test-environment-1", {
      limit: 10,
      offset: 5,
    });
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "list"], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows get", () => {
  it("prints the workflow on success", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["workflows", "get", "test-workflow-1"], {
      from: "user",
    });

    expect(getWorkflow).toHaveBeenCalledWith(
      "test-environment-1",
      "test-workflow-1",
    );
    expect(logSpy).toHaveBeenCalledWith(testWorkflow);
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "get", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows trigger", () => {
  it("triggers with the parsed payload and subscriber identifier", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { triggered: true, runPublicId: "run-1" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "trigger",
        "test-signup",
        "--email",
        "test@example.com",
        "--payload",
        '{"plan":"pro"}',
      ],
      { from: "user" },
    );

    expect(triggerWorkflow).toHaveBeenCalledWith("test-environment-1", {
      key: "test-signup",
      subscriber: {
        publicId: undefined,
        externalId: undefined,
        email: "test@example.com",
      },
      payload: { plan: "pro" },
    });
  });

  it("errors without calling the API when no subscriber identifier is given", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "trigger", "test-signup"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No subscriber specified"),
    );
    expect(process.exitCode).toBe(1);
    expect(triggerWorkflow).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("errors without calling the API when --payload isn't valid JSON", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "workflows",
        "trigger",
        "test-signup",
        "--email",
        "test@example.com",
        "--payload",
        "not-json",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("--payload must be valid JSON.");
    expect(process.exitCode).toBe(1);
    expect(triggerWorkflow).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "trigger", "test-signup", "--email", "test@example.com"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Workflow or subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
