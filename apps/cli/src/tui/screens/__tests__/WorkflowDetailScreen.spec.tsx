import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  deleteWorkflow,
  getWorkflow,
  previewBroadcast,
  triggerBroadcast,
  triggerWorkflow,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import { WorkflowDetailScreen } from "../WorkflowDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  triggerBroadcast: vi.fn(),
  previewBroadcast: vi.fn(),
}));

const testWorkflow = {
  publicId: "test-workflow-1",
  key: "test-signup",
  name: "Test Signup",
  description: "Fires when a user signs up",
  status: "active",
  type: "automation",
  steps: [
    {
      publicId: "test-step-1",
      stepOrder: 0,
      type: "email",
      delayMs: 0,
      subject: "Welcome!",
    },
    {
      publicId: "test-step-2",
      stepOrder: 1,
      type: "webhook",
      delayMs: 60000,
    },
  ],
  triggers: [
    {
      source: "stripe",
      event: "trial_started",
      label: "Trial started",
      active: true,
    },
  ],
  sentCount: 12,
  failedCount: 1,
  skippedCount: 2,
  pendingCount: 3,
  bouncedCount: 1,
  hardBounceCount: 1,
  softBounceCount: 0,
  successRate: 12 / 13,
};

function renderScreen(
  onDeleted = vi.fn(),
  onViewRuns = vi.fn(),
  onViewBroadcasts = vi.fn(),
  onViewTriggers = vi.fn(),
) {
  return {
    onDeleted,
    onViewRuns,
    onViewBroadcasts,
    onViewTriggers,
    ...render(
      <WorkflowDetailScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
        onDeleted={onDeleted}
        onViewRuns={onViewRuns}
        onViewBroadcasts={onViewBroadcasts}
        onViewTriggers={onViewTriggers}
      />,
    ),
  };
}

describe("WorkflowDetailScreen", () => {
  it("renders workflow fields and each step", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("key: test-signup");
    });
    expect(lastFrame()).toContain("name: Test Signup");
    expect(lastFrame()).toContain("status: active");
    expect(lastFrame()).toContain("description: Fires when a user signs up");
    expect(lastFrame()).toContain("0. email (delay 0ms) — Welcome!");
    expect(lastFrame()).toContain("1. webhook (delay 60000ms)");
  });

  it("renders send outcome counts", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Send outcomes:");
    });
    expect(lastFrame()).toContain("sent: 12");
    expect(lastFrame()).toContain("failed: 1");
    expect(lastFrame()).toContain("skipped: 2");
    expect(lastFrame()).toContain("pending: 3");
    expect(lastFrame()).toContain("bounced: 1 (hard 1, soft 0)");
    expect(lastFrame()).toContain("success rate: 92.3%");
  });

  it("shows a dash for success rate when there have been no sends or failures yet", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        ...testWorkflow,
        sentCount: 0,
        failedCount: 0,
        successRate: null,
      },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("success rate: —");
    });
  });

  it("shows an error when the workflow isn't found", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <WorkflowDetailScreen
        environmentId="test-environment-1"
        workflowId="missing"
        onDeleted={vi.fn()}
        onViewRuns={vi.fn()}
        onViewBroadcasts={vi.fn()}
        onViewTriggers={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("WorkflowDetailScreen delete", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("key: test-signup");
    });
    return screen;
  }

  it("shows a confirm prompt when 'd' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Delete workflow test-workflow-1? This cannot be undone.",
      );
    });
  });

  it("cancels without calling the API when Enter is pressed immediately (default is cancel)", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("This cannot be undone.");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("This cannot be undone.");
    });
    expect(deleteWorkflow).not.toHaveBeenCalled();
  });
});

describe("WorkflowDetailScreen trigger", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("key: test-signup");
    });
    return screen;
  }

  it("shows a text prompt when 't' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trigger for subscriber email:");
    });
  });

  it("triggers with the typed email and shows the run on success", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { triggered: true, runPublicId: "test-run-1" },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trigger for subscriber email:");
    });

    await tick();
    stdin.write("test@example.com");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Triggered. Run: test-run-1");
    });
    expect(triggerWorkflow).toHaveBeenCalledWith({
      key: "test-signup",
      subscriber: { email: "test@example.com" },
      payload: {},
    });
  });

  it("shows the reason when the workflow declines to trigger", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { triggered: false, reason: "workflow_has_no_steps" },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trigger for subscriber email:");
    });

    await tick();
    stdin.write("test@example.com");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Not triggered: workflow_has_no_steps");
    });
  });

  it("does not call the API when submitting an empty email", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trigger for subscriber email:");
    });

    await tick();
    stdin.write("\r");
    await tick();

    expect(triggerWorkflow).not.toHaveBeenCalled();
  });

  it("shows an error on a 404", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Trigger for subscriber email:");
    });

    await tick();
    stdin.write("test@example.com");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Workflow or subscriber not found.");
    });
  });
});

describe("WorkflowDetailScreen edit", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("key: test-signup");
    });
    return screen;
  }

  it("shows the metadata field menu when 'e' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test Signup");
    });
    expect(lastFrame()).toContain("Status: Active");
  });

  it("edits the default field and reflects it in the menu, without saving", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test Signup");
    });

    // Default-selected item is "Name" (the first field).
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Status: Active");
    });

    await tick();
    stdin.write(" Updated");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test Signup Updated");
    });
    expect(updateWorkflow).not.toHaveBeenCalled();
  });
});

describe("WorkflowDetailScreen runs", () => {
  it("calls onViewRuns when 'r' is pressed", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const onViewRuns = vi.fn();
    const { lastFrame, stdin } = renderScreen(vi.fn(), onViewRuns);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("key: test-signup");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    stdin.write("r");

    expect(onViewRuns).toHaveBeenCalled();
  });

  it("lists the workflow's triggers, marking inactive ones", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        ...testWorkflow,
        triggers: [
          ...testWorkflow.triggers,
          {
            source: "stripe",
            event: "payment_failed",
            label: "Payment failed",
            active: false,
          },
        ],
      },
    } as never);
    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("stripe · Trial started");
    });
    expect(lastFrame()).toContain("stripe · Payment failed (inactive)");
  });

  it("lists exit conditions", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        ...testWorkflow,
        exitConditions: [
          {
            source: "stripe",
            event: "trial_converted",
            label: "Trial converted to paid",
            active: true,
          },
        ],
      },
    } as never);
    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Exits when:");
    });
    expect(lastFrame()).toContain("stripe · Trial converted to paid");
  });

  it("copes with an API that doesn't return triggers yet", async () => {
    const { triggers: _omitted, ...withoutTriggers } = testWorkflow;
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: withoutTriggers,
    } as never);
    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("none (API only)");
    });
  });

  it("calls onViewTriggers when 'g' is pressed", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testWorkflow,
    } as never);
    const onViewTriggers = vi.fn();
    const { lastFrame, stdin } = renderScreen(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      onViewTriggers,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("key: test-signup");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    stdin.write("g");

    expect(onViewTriggers).toHaveBeenCalled();
  });

  it("calls onViewBroadcasts when 'h' is pressed", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testWorkflow, type: "broadcast" },
    } as never);
    const onViewBroadcasts = vi.fn();
    const { lastFrame, stdin } = renderScreen(
      vi.fn(),
      vi.fn(),
      onViewBroadcasts,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("key: test-signup");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    stdin.write("h");

    expect(onViewBroadcasts).toHaveBeenCalled();
  });
});

describe("WorkflowDetailScreen broadcast", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testWorkflow, type: "broadcast" },
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("key: test-signup");
    });
    return screen;
  }

  it("sends a test to a single subscriber when 't' is pressed", async () => {
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { triggered: true, runPublicId: "test-run-1" },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("t");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Send test to subscriber email:");
    });

    await tick();
    stdin.write("test@example.com");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Triggered. Run: test-run-1");
    });
    expect(triggerWorkflow).toHaveBeenCalledWith({
      key: "test-signup",
      subscriber: { email: "test@example.com" },
      payload: {},
    });
    expect(triggerBroadcast).not.toHaveBeenCalled();
  });

  it("shows the audience menu when 'b' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("b");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("All opted-in subscribers");
    });
    expect(lastFrame()).toContain("Opted-in subscribers with a tag");
  });

  it("previews the matched audience size before asking to confirm, defaulting to cancel", async () => {
    vi.mocked(previewBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { matchedCount: 4231 },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("All opted-in subscribers");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Send over:");
    });
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Broadcast to 4231 matched subscribers now?",
      );
    });
    expect(previewBroadcast).toHaveBeenCalledWith("test-workflow-1", {
      audience: { type: "optedIn" },
    });
    // Default-selected item is "No, cancel" — the confirm step must not
    // fire the actual broadcast on its own.
    expect(triggerBroadcast).not.toHaveBeenCalled();
  });

  it("cancels without triggering when 'No, cancel' (the default) is confirmed", async () => {
    vi.mocked(previewBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { matchedCount: 4231 },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("All opted-in subscribers");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Send over:");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Broadcast to 4231");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Broadcast to 4231");
    });
    expect(triggerBroadcast).not.toHaveBeenCalled();
  });

  it("triggers with the chosen send window once confirmed", async () => {
    vi.mocked(previewBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { matchedCount: 4231 },
    } as never);
    vi.mocked(triggerBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { broadcastId: "bc_1", status: "pending" },
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("All opted-in subscribers");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Send over:");
    });

    // "Send now" → "6 hours" → "24 hours"
    await tick();
    stdin.write("\u001B[B");
    await tick();
    stdin.write("\u001B[B");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Broadcast to 4231 matched subscribers, spread over 24 hours?",
      );
    });

    // Default is "No, cancel"; move to "Yes, send".
    await tick();
    stdin.write("\u001B[A");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Broadcast queued: bc_1");
    });
    expect(triggerBroadcast).toHaveBeenCalledWith("test-workflow-1", {
      audience: { type: "optedIn" },
      sendOverHours: 24,
    });
  });

  it("shows an error from the preview when the workflow is paused or has no steps", async () => {
    vi.mocked(previewBroadcast).mockResolvedValue({
      status: 400,
      headers: new Headers(),
      data: undefined,
    } as never);
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("All opted-in subscribers");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Workflow is paused or has no steps.");
    });
    expect(triggerBroadcast).not.toHaveBeenCalled();
  });
});
