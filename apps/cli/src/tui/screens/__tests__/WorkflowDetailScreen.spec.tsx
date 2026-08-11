import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { getWorkflow } from "@subscriber.dev/api-client/cli";

import { WorkflowDetailScreen } from "../WorkflowDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkflow: vi.fn(),
}));

describe("WorkflowDetailScreen", () => {
  it("renders workflow fields and each step", async () => {
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
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
      },
    } as never);

    const { lastFrame } = render(
      <WorkflowDetailScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

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
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});
