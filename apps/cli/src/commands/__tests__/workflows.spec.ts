import { readFileSync } from "node:fs";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listEnvironmentRuns,
  listWorkflowRuns,
  listWorkflows,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerWorkflowsCommand } from "../workflows.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  listWorkflowRuns: vi.fn(),
  listEnvironmentRuns: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
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

describe("workflows create", () => {
  it("sends the parsed workflow definition", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        key: "test-signup",
        name: "Test Signup",
        steps: [{ type: "email", delayMs: 0, subject: "hi", body: "hi" }],
      }),
    );
    vi.mocked(createWorkflow).mockResolvedValue({
      status: 201,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "create", "--file", "workflow.json"],
      { from: "user" },
    );

    expect(readFileSync).toHaveBeenCalledWith("workflow.json", "utf-8");
    expect(createWorkflow).toHaveBeenCalledWith("test-environment-1", {
      key: "test-signup",
      name: "Test Signup",
      steps: [{ type: "email", delayMs: 0, subject: "hi", body: "hi" }],
    });
  });

  it("errors without calling the API when the file isn't valid JSON", async () => {
    vi.mocked(readFileSync).mockReturnValue("not json");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "create", "--file", "workflow.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("File must contain valid JSON.");
    expect(process.exitCode).toBe(1);
    expect(createWorkflow).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ key: "k", name: "n", steps: [] }),
    );
    vi.mocked(createWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "create", "--file", "workflow.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows update", () => {
  it("sends the parsed partial update", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ status: "paused" }),
    );
    vi.mocked(updateWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testWorkflow, status: "paused" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "update", "test-workflow-1", "--file", "patch.json"],
      { from: "user" },
    );

    expect(updateWorkflow).toHaveBeenCalledWith(
      "test-environment-1",
      "test-workflow-1",
      { status: "paused" },
    );
  });

  it("errors without calling the API when the file can't be read", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "update", "test-workflow-1", "--file", "missing.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read missing.json"),
    );
    expect(process.exitCode).toBe(1);
    expect(updateWorkflow).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));
    vi.mocked(updateWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "update", "missing", "--file", "patch.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows delete", () => {
  it("deletes the workflow and confirms", async () => {
    vi.mocked(deleteWorkflow).mockResolvedValue({
      status: 204,
      headers: new Headers(),
      data: undefined,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "delete", "test-workflow-1"],
      { from: "user" },
    );

    expect(deleteWorkflow).toHaveBeenCalledWith(
      "test-environment-1",
      "test-workflow-1",
    );
    expect(logSpy).toHaveBeenCalledWith("Deleted workflow test-workflow-1.");
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(deleteWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "delete", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows runs", () => {
  it("passes pagination params through and prints the runs", async () => {
    const testRun = {
      publicId: "test-run-1",
      status: "completed",
      triggeredAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
      steps: [],
    };
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { runs: [testRun], limit: 10, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "runs",
        "test-workflow-1",
        "--limit",
        "10",
        "--offset",
        "5",
      ],
      { from: "user" },
    );

    expect(listWorkflowRuns).toHaveBeenCalledWith(
      "test-environment-1",
      "test-workflow-1",
      { limit: 10, offset: 5 },
    );
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "runs", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows run-history", () => {
  it("passes pagination params through and prints the runs", async () => {
    const testRun = {
      publicId: "test-run-1",
      status: "completed",
      triggeredAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
      workflow: {
        publicId: "test-workflow-1",
        key: "test-signup",
        name: "Test Signup",
      },
      steps: [],
    };
    vi.mocked(listEnvironmentRuns).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { runs: [testRun], limit: 10, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "run-history", "--limit", "10", "--offset", "5"],
      { from: "user" },
    );

    expect(listEnvironmentRuns).toHaveBeenCalledWith("test-environment-1", {
      limit: 10,
      offset: 5,
    });
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listEnvironmentRuns).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "run-history"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
