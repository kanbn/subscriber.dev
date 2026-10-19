import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAnalytics } from "@subscriber.dev/api-client/cli";
import { readCliConfig } from "@subscriber.dev/shared";

import { registerAnalyticsCommand } from "../analytics.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getAnalytics: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

const testAnalytics = {
  days: 30,
  subscribers: { total: 100, newInPeriod: 5, optedOut: 3, optedOutInPeriod: 1 },
  sends: {
    sent: 90,
    failed: 2,
    skipped: 1,
    pending: 0,
    bounced: 2,
    successRate: 0.978,
  },
  bounces: { hard: 1, soft: 1 },
};

function buildProgram() {
  const program = new Command();
  registerAnalyticsCommand(program);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCliConfig).mockReturnValue({
    token: "test-token",
    currentEnvironmentId: "test-environment-1",
  });
});

describe("analytics", () => {
  it("prints the analytics for the current environment", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testAnalytics,
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["analytics"], { from: "user" });

    expect(getAnalytics).toHaveBeenCalledWith("test-environment-1", {
      days: undefined,
    });
    expect(logSpy).toHaveBeenCalledWith(testAnalytics);
  });

  it("passes --days through as a number", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testAnalytics,
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await buildProgram().parseAsync(["analytics", "--days", "7"], {
      from: "user",
    });

    expect(getAnalytics).toHaveBeenCalledWith("test-environment-1", {
      days: 7,
    });
  });

  it("prints an error and exits on a 404", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync(["analytics"], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith("Environment not found.");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
