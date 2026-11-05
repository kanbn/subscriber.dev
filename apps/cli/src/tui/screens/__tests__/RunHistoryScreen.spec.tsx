import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listEnvironmentRuns } from "@subscriber.dev/api-client/cli";

import { RunHistoryScreen } from "../RunHistoryScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listEnvironmentRuns: vi.fn(),
}));

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
  subscriber: {
    publicId: "test-subscriber-1",
    email: "alice@example.com",
    name: null,
    externalId: null,
  },
  steps: [
    {
      stepOrder: 0,
      type: "email",
      status: "sent",
      scheduledAt: "2026-01-01T00:00:00.000Z",
      sentAt: "2026-01-01T00:00:05.000Z",
      errorMessage: null,
    },
    {
      stepOrder: 1,
      type: "webhook",
      status: "failed",
      scheduledAt: "2026-01-01T00:01:00.000Z",
      sentAt: null,
      errorMessage: "SMTP error",
    },
  ],
};

function listRunsMock(runs: unknown[]) {
  vi.mocked(listEnvironmentRuns).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { runs, limit: 50, offset: 0 },
  } as never);
}

describe("RunHistoryScreen", () => {
  it("lists each run with its workflow, subscriber, status, and step outcome summary", async () => {
    listRunsMock([testRun]);

    const { lastFrame } = render(
      <RunHistoryScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("alice@example.com");
    });
    expect(lastFrame()).toContain("Test Signup");
    expect(lastFrame()).toContain("completed");
    expect(lastFrame()).toContain("1/2 sent, 1 failed");
  });

  it("shows an empty-state hint when there are no runs", async () => {
    listRunsMock([]);

    const { lastFrame } = render(
      <RunHistoryScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No runs yet.");
    });
  });

  it("shows an error when the environment isn't found", async () => {
    vi.mocked(listEnvironmentRuns).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(<RunHistoryScreen environmentId="missing" />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("RunHistoryScreen detail", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it("shows the workflow name and per-step status when a run is selected", async () => {
    listRunsMock([testRun]);

    const { lastFrame, stdin } = render(
      <RunHistoryScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("alice@example.com");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Run test-run-1");
    });
    expect(lastFrame()).toContain("workflow: Test Signup");
    expect(lastFrame()).toContain("0. email — sent");
    expect(lastFrame()).toContain("1. webhook — failed");
    expect(lastFrame()).toContain("SMTP error");
  });

  it("returns to the list when 'b' is pressed", async () => {
    listRunsMock([testRun]);

    const { lastFrame, stdin } = render(
      <RunHistoryScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("alice@example.com");
    });

    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Run test-run-1");
    });

    await tick();
    stdin.write("b");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Run test-run-1");
    });
    expect(lastFrame()).toContain("alice@example.com");
  });

  it("polls for new runs and keeps the list through a failed refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listRunsMock([testRun]);
    const { lastFrame, unmount } = render(
      <RunHistoryScreen environmentId="test-environment-1" />,
    );
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Signup");
    });

    vi.mocked(listEnvironmentRuns).mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastFrame()).toContain("Test Signup");

    listRunsMock([
      {
        ...testRun,
        publicId: "test-run-2",
        workflow: { ...testRun.workflow, name: "Trial Started" },
      },
      testRun,
    ]);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trial Started");
    });

    unmount();
    vi.useRealTimers();
  });
});
