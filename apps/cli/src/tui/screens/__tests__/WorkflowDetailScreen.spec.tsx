import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { deleteWorkflow, getWorkflow } from "@subscriber.dev/api-client/cli";

import { WorkflowDetailScreen } from "../WorkflowDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
}));

const testWorkflow = {
  publicId: "test-workflow-1",
  key: "test-signup",
  name: "Test Signup",
  description: "Fires when a user signs up",
  status: "active",
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
};

function renderScreen(onDeleted = vi.fn()) {
  return {
    onDeleted,
    ...render(
      <WorkflowDetailScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
        onDeleted={onDeleted}
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
