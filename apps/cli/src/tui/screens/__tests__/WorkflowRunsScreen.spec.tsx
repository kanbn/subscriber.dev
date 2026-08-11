import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listWorkflowRuns } from "@subscriber.dev/api-client/cli";

import { WorkflowRunsScreen } from "../WorkflowRunsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflowRuns: vi.fn(),
}));

const testRun = {
  publicId: "test-run-1",
  status: "completed",
  triggeredAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:01:00.000Z",
  steps: [{ stepOrder: 0, type: "email", status: "sent" }],
};

describe("WorkflowRunsScreen", () => {
  it("lists each run with its status and step count", async () => {
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { runs: [testRun], limit: 50, offset: 0 },
    } as never);

    const { lastFrame } = render(
      <WorkflowRunsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test-run-1 — completed (1 step)");
    });
  });

  it("shows an empty-state hint when there are no runs", async () => {
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { runs: [], limit: 50, offset: 0 },
    } as never);

    const { lastFrame } = render(
      <WorkflowRunsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No runs yet.");
    });
  });

  it("shows an error when the workflow isn't found", async () => {
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <WorkflowRunsScreen
        environmentId="test-environment-1"
        workflowId="missing"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});
