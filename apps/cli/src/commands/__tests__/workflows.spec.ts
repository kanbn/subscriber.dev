import { readFileSync } from "node:fs";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelBroadcast,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listBroadcasts,
  listEnvironmentRuns,
  listWorkflowRuns,
  listWorkflows,
  pauseBroadcast,
  redispatchBroadcast,
  resumeBroadcast,
  sendTestEmail,
  triggerBroadcast,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerWorkflowsCommand } from "../workflows.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
  sendTestEmail: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  listWorkflowRuns: vi.fn(),
  listEnvironmentRuns: vi.fn(),
  triggerBroadcast: vi.fn(),
  listBroadcasts: vi.fn(),
  pauseBroadcast: vi.fn(),
  resumeBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
  redispatchBroadcast: vi.fn(),
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
    token: "test-token",
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

    expect(listWorkflows).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
    });
  });

  it("passes --type through as a filter", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [testWorkflow], limit: 20, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "list", "--type", "broadcast"],
      { from: "user" },
    );

    expect(listWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({ type: "broadcast" }),
    );
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

    expect(getWorkflow).toHaveBeenCalledWith("test-workflow-1");
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

describe("workflows test", () => {
  it("sends the chosen step to the given address with sample data", async () => {
    vi.mocked(sendTestEmail).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { to: "ada@acme.com", subject: "[Test] Welcome" },
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "test",
        "wf-1",
        "--step",
        "3",
        "--to",
        "ada@acme.com",
        "--data",
        '{"plan":"pro"}',
      ],
      { from: "user" },
    );

    expect(sendTestEmail).toHaveBeenCalledWith({
      workflowId: "wf-1",
      step: 3,
      to: "ada@acme.com",
      data: { plan: "pro" },
    });
    expect(logSpy).toHaveBeenCalledWith(
      'Sent "[Test] Welcome" to ada@acme.com.',
    );
  });

  it("shows the API's reason when it can't send", async () => {
    vi.mocked(sendTestEmail).mockResolvedValue({
      status: 400,
      headers: new Headers(),
      data: { message: "Step 2 is a webhook step, not an email" },
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", "test", "wf-1", "--step", "2"],
      {
        from: "user",
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Step 2 is a webhook step, not an email",
    );
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

    expect(triggerWorkflow).toHaveBeenCalledWith({
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
    expect(createWorkflow).toHaveBeenCalledWith({
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

    expect(updateWorkflow).toHaveBeenCalledWith("test-workflow-1", {
      status: "paused",
    });
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

    expect(deleteWorkflow).toHaveBeenCalledWith("test-workflow-1");
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

    expect(listWorkflowRuns).toHaveBeenCalledWith("test-workflow-1", {
      limit: 10,
      offset: 5,
    });
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

    expect(listEnvironmentRuns).toHaveBeenCalledWith({
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

describe("workflows broadcast", () => {
  it("sends the parsed audience filter", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ type: "optedIn" }),
    );
    vi.mocked(triggerBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { broadcastId: "bc_1", status: "pending" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcast",
        "test-workflow-1",
        "--audience",
        "audience.json",
      ],
      { from: "user" },
    );

    expect(readFileSync).toHaveBeenCalledWith("audience.json", "utf-8");
    expect(triggerBroadcast).toHaveBeenCalledWith("test-workflow-1", {
      audience: { type: "optedIn" },
    });
  });

  it("errors without calling the API when the file isn't valid JSON", async () => {
    vi.mocked(readFileSync).mockReturnValue("not json");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcast",
        "test-workflow-1",
        "--audience",
        "audience.json",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("File must contain valid JSON.");
    expect(process.exitCode).toBe(1);
    expect(triggerBroadcast).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits when the workflow is paused or has no steps", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ type: "optedIn" }),
    );
    vi.mocked(triggerBroadcast).mockResolvedValue({
      status: 400,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcast",
        "test-workflow-1",
        "--audience",
        "audience.json",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Workflow is paused or has no steps.",
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ type: "optedIn" }),
    );
    vi.mocked(triggerBroadcast).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", "broadcast", "missing", "--audience", "audience.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("workflows broadcast --send-over-hours", () => {
  it("passes the send window through", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ type: "optedIn" }),
    );
    vi.mocked(triggerBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { broadcastId: "bc_1", status: "pending" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcast",
        "test-workflow-1",
        "--audience",
        "audience.json",
        "--send-over-hours",
        "48",
      ],
      { from: "user" },
    );

    expect(triggerBroadcast).toHaveBeenCalledWith("test-workflow-1", {
      audience: { type: "optedIn" },
      sendOverHours: 48,
    });
  });

  it("rejects an out-of-range window without calling the API", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ type: "optedIn" }),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcast",
        "test-workflow-1",
        "--audience",
        "audience.json",
        "--send-over-hours",
        "500",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "--send-over-hours must be between 0 and 168.",
    );
    expect(triggerBroadcast).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});

describe.each([
  ["broadcast-pause", pauseBroadcast, "Paused", "pause"],
  ["broadcast-resume", resumeBroadcast, "Resumed", "resume"],
  ["broadcast-cancel", cancelBroadcast, "Cancelled", "cancel"],
  ["broadcast-redispatch", redispatchBroadcast, "Re-dispatched", "re-dispatch"],
] as const)("workflows %s", (command, fn, past, verb) => {
  it("calls the API and confirms", async () => {
    vi.mocked(fn).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { publicId: "bc_1", status: "paused" },
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["workflows", command, "test-workflow-1", "bc_1"],
      { from: "user" },
    );

    expect(fn).toHaveBeenCalledWith("test-workflow-1", "bc_1");
    expect(logSpy).toHaveBeenCalledWith(`${past} broadcast bc_1.`);
  });

  it("explains a 409 for a broadcast in the wrong status", async () => {
    vi.mocked(fn).mockResolvedValue({
      status: 409,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["workflows", command, "test-workflow-1", "bc_1"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      `Can't ${verb} this broadcast in its current status.`,
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});

describe("workflows broadcasts", () => {
  it("passes pagination params through and prints the broadcasts", async () => {
    const testBroadcast = {
      publicId: "bc_1",
      status: "queued",
      matchedCount: 42,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(listBroadcasts).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { broadcasts: [testBroadcast], limit: 10, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "workflows",
        "broadcasts",
        "test-workflow-1",
        "--limit",
        "10",
        "--offset",
        "5",
      ],
      { from: "user" },
    );

    expect(listBroadcasts).toHaveBeenCalledWith("test-workflow-1", {
      limit: 10,
      offset: 5,
    });
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listBroadcasts).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["workflows", "broadcasts", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Workflow not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
