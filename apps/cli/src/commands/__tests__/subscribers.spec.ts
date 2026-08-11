import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSubscriber,
  deleteSubscriber,
  getSubscriber,
  listSubscribers,
  updateSubscriber,
} from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerSubscribersCommand } from "../subscribers.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listSubscribers: vi.fn(),
  getSubscriber: vi.fn(),
  createSubscriber: vi.fn(),
  updateSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
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
      emailOptedIn: true,
      limit: 10,
      offset: undefined,
    });
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
      expect.objectContaining({ emailOptedIn: false }),
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
    });
  });

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
