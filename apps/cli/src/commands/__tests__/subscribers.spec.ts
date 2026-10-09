import { readFileSync } from "node:fs";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSubscriberTag,
  bulkUpsertSubscribers,
  createSubscriber,
  deleteSubscriber,
  getSubscriber,
  listSubscribers,
  removeSubscriberTag,
  updateSubscriber,
  updateSubscriberPreferences,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerSubscribersCommand } from "../subscribers.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listSubscribers: vi.fn(),
  getSubscriber: vi.fn(),
  createSubscriber: vi.fn(),
  updateSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  bulkUpsertSubscribers: vi.fn(),
  updateSubscriberPreferences: vi.fn(),
  addSubscriberTag: vi.fn(),
  removeSubscriberTag: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const testSubscriber = {
  publicId: "test-subscriber-1",
  email: "test@example.com",
  phone: null,
  externalId: null,
  firstName: "Test",
  lastName: "User",
  name: null,
  attributes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  unsubscribeUrl: null,
};

function buildProgram() {
  const program = new Command();
  registerSubscribersCommand(program);
  return program;
}

beforeEach(() => {
  vi.mocked(readCliConfig).mockReturnValue({
    apiKey: "test-key",
    currentEnvironmentId: "test-environment-1",
  });
});

describe("subscribers list", () => {
  it("passes filters through to the API", async () => {
    vi.mocked(listSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscribers: [testSubscriber], limit: 100, offset: 0 },
    } as never);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "subscribers",
        "list",
        "--email",
        "test@example.com",
        "--opted-in",
        "--limit",
        "10",
      ],
      { from: "user" },
    );

    expect(listSubscribers).toHaveBeenCalledWith("test-environment-1", {
      email: "test@example.com",
      externalId: undefined,
      emailOptedIn: "true",
      limit: 10,
      offset: undefined,
    });
  });

  it("passes --search through as the q param", async () => {
    vi.mocked(listSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscribers: [], limit: 100, offset: 0 },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "list", "--search", "ali"],
      { from: "user" },
    );

    expect(listSubscribers).toHaveBeenCalledWith(
      "test-environment-1",
      expect.objectContaining({ q: "ali" }),
    );
  });

  it("treats --opted-out as emailOptedIn: false", async () => {
    vi.mocked(listSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscribers: [], limit: 100, offset: 0 },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["subscribers", "list", "--opted-out"], {
      from: "user",
    });

    expect(listSubscribers).toHaveBeenCalledWith(
      "test-environment-1",
      expect.objectContaining({ emailOptedIn: "false" }),
    );
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(listSubscribers).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["subscribers", "list"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers get", () => {
  it("prints the subscriber on success", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: null },
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "get", "test-subscriber-1"],
      { from: "user" },
    );

    expect(getSubscriber).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
    );
    expect(logSpy).toHaveBeenCalledWith({
      subscriber: testSubscriber,
      preferences: null,
    });
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["subscribers", "get", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers create", () => {
  it("sends only the flags that were passed", async () => {
    vi.mocked(createSubscriber).mockResolvedValue({
      status: 201,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: {} },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "create", "--email", "test@example.com"],
      { from: "user" },
    );

    expect(createSubscriber).toHaveBeenCalledWith("test-environment-1", {
      email: "test@example.com",
      phone: undefined,
      externalId: undefined,
      firstName: undefined,
      lastName: undefined,
      name: undefined,
      attributes: undefined,
    });
  });

  it("parses --attributes as a JSON object", async () => {
    vi.mocked(createSubscriber).mockResolvedValue({
      status: 201,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: {} },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "subscribers",
        "create",
        "--email",
        "a@b.com",
        "--attributes",
        '{"plan":"pro"}',
      ],
      { from: "user" },
    );

    expect(createSubscriber).toHaveBeenCalledWith(
      "test-environment-1",
      expect.objectContaining({ attributes: { plan: "pro" } }),
    );
  });

  it.each(["not json", "[1]", '"pro"'])(
    "errors without calling the API when --attributes is %s",
    async (value) => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      process.exitCode = undefined;

      await buildProgram().parseAsync(
        ["subscribers", "create", "--email", "a@b.com", "--attributes", value],
        { from: "user" },
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "--attributes must be a JSON object.",
      );
      expect(process.exitCode).toBe(1);
      expect(createSubscriber).not.toHaveBeenCalled();

      process.exitCode = undefined;
    },
  );

  it("prints an error and exits when creation fails", async () => {
    vi.mocked(createSubscriber).mockResolvedValue({
      status: 400,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "create", "--email", "bad"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Failed to create subscriber.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers update", () => {
  it("only includes the fields that were passed", async () => {
    vi.mocked(updateSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "update", "test-subscriber-1", "--first-name", "Updated"],
      { from: "user" },
    );

    expect(updateSubscriber).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      { firstName: "Updated" },
    );
  });

  it("sends --attributes on its own", async () => {
    vi.mocked(updateSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      [
        "subscribers",
        "update",
        "test-subscriber-1",
        "--attributes",
        '{"plan":"pro"}',
      ],
      { from: "user" },
    );

    expect(updateSubscriber).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      { attributes: { plan: "pro" } },
    );
  });

  it("errors without calling the API when no fields are passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "update", "test-subscriber-1"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No fields to update"),
    );
    expect(process.exitCode).toBe(1);
    expect(updateSubscriber).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(updateSubscriber).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "update", "missing", "--email", "x@example.com"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers update-preferences", () => {
  it("sends email: true for --opted-in", async () => {
    vi.mocked(updateSubscriberPreferences).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { preferences: { email: true } },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "update-preferences", "test-subscriber-1", "--opted-in"],
      { from: "user" },
    );

    expect(updateSubscriberPreferences).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      { email: true },
    );
  });

  it("sends email: false for --opted-out", async () => {
    vi.mocked(updateSubscriberPreferences).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { preferences: { email: false } },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "update-preferences", "test-subscriber-1", "--opted-out"],
      { from: "user" },
    );

    expect(updateSubscriberPreferences).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      { email: false },
    );
  });

  it("errors without calling the API when neither flag is passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "update-preferences", "test-subscriber-1"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Pass exactly one of --opted-in or --opted-out.",
    );
    expect(process.exitCode).toBe(1);
    expect(updateSubscriberPreferences).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("errors without calling the API when both flags are passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "subscribers",
        "update-preferences",
        "test-subscriber-1",
        "--opted-in",
        "--opted-out",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Pass exactly one of --opted-in or --opted-out.",
    );
    expect(process.exitCode).toBe(1);
    expect(updateSubscriberPreferences).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(updateSubscriberPreferences).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "update-preferences", "missing", "--opted-in"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers delete", () => {
  it("deletes the subscriber and confirms", async () => {
    vi.mocked(deleteSubscriber).mockResolvedValue({
      status: 204,
      headers: new Headers(),
      data: undefined,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "delete", "test-subscriber-1"],
      { from: "user" },
    );

    expect(deleteSubscriber).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
    );
    expect(logSpy).toHaveBeenCalledWith(
      "Deleted subscriber test-subscriber-1.",
    );
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(deleteSubscriber).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["subscribers", "delete", "missing"], {
      from: "user",
    });

    expect(errorSpy).toHaveBeenCalledWith("Subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers bulk", () => {
  it("accepts a bare array and wraps it in { subscribers }", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify([{ email: "a@example.com" }]),
    );
    vi.mocked(bulkUpsertSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        results: [{ index: 0, status: "created" }],
        summary: { created: 1, updated: 0, errored: 0 },
      },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "rows.json"],
      { from: "user" },
    );

    expect(readFileSync).toHaveBeenCalledWith("rows.json", "utf-8");
    expect(bulkUpsertSubscribers).toHaveBeenCalledWith("test-environment-1", {
      subscribers: [{ email: "a@example.com" }],
    });
  });

  it("accepts an object with a subscribers array", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ subscribers: [{ email: "a@example.com" }] }),
    );
    vi.mocked(bulkUpsertSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { results: [], summary: {} },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "rows.json"],
      { from: "user" },
    );

    expect(bulkUpsertSubscribers).toHaveBeenCalledWith("test-environment-1", {
      subscribers: [{ email: "a@example.com" }],
    });
  });

  it("reads from stdin (fd 0) when --file is -", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify([]));
    vi.mocked(bulkUpsertSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { results: [], summary: {} },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["subscribers", "bulk", "--file", "-"], {
      from: "user",
    });

    expect(readFileSync).toHaveBeenCalledWith(0, "utf-8");
  });

  it("errors without calling the API when the file can't be read", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "missing.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read missing.json"),
    );
    expect(process.exitCode).toBe(1);
    expect(bulkUpsertSubscribers).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("errors without calling the API when the file isn't valid JSON", async () => {
    vi.mocked(readFileSync).mockReturnValue("not json");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "rows.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("File must contain valid JSON.");
    expect(process.exitCode).toBe(1);
    expect(bulkUpsertSubscribers).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("errors without calling the API when the JSON has no subscribers array", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ foo: "bar" }));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "rows.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("JSON must be an array"),
    );
    expect(process.exitCode).toBe(1);
    expect(bulkUpsertSubscribers).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify([]));
    vi.mocked(bulkUpsertSubscribers).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "bulk", "--file", "rows.json"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});

describe("subscribers tag", () => {
  it("adds a tag with --add", async () => {
    vi.mocked(addSubscriberTag).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { tag: "vip" },
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "tag", "test-subscriber-1", "--add", "vip"],
      { from: "user" },
    );

    expect(addSubscriberTag).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      { tag: "vip" },
    );
  });

  it("removes a tag with --remove", async () => {
    vi.mocked(removeSubscriberTag).mockResolvedValue({
      status: 204,
      headers: new Headers(),
      data: undefined,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(
      ["subscribers", "tag", "test-subscriber-1", "--remove", "vip"],
      { from: "user" },
    );

    expect(removeSubscriberTag).toHaveBeenCalledWith(
      "test-environment-1",
      "test-subscriber-1",
      "vip",
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Removed tag "vip" from test-subscriber-1.',
    );
  });

  it("errors without calling the API when neither flag is passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "tag", "test-subscriber-1"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Pass exactly one of --add or --remove.",
    );
    expect(process.exitCode).toBe(1);
    expect(addSubscriberTag).not.toHaveBeenCalled();
    expect(removeSubscriberTag).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("errors without calling the API when both flags are passed", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      [
        "subscribers",
        "tag",
        "test-subscriber-1",
        "--add",
        "vip",
        "--remove",
        "beta",
      ],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Pass exactly one of --add or --remove.",
    );
    expect(process.exitCode).toBe(1);
    expect(addSubscriberTag).not.toHaveBeenCalled();
    expect(removeSubscriberTag).not.toHaveBeenCalled();

    process.exitCode = undefined;
  });

  it("prints an error and exits on a 404 when adding", async () => {
    vi.mocked(addSubscriberTag).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(
      ["subscribers", "tag", "missing", "--add", "vip"],
      { from: "user" },
    );

    expect(errorSpy).toHaveBeenCalledWith("Subscriber not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
