import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listWorkflows } from "@subscriber.dev/api-client/cli";

import { WorkflowsScreen } from "../WorkflowsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflows: vi.fn(),
}));

const testWorkflow = {
  publicId: "test-workflow-1",
  key: "test-signup",
  name: "Test Signup",
  status: "active",
};

describe("WorkflowsScreen", () => {
  it("labels each row with name, key, and status", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [testWorkflow], limit: 100, offset: 0 },
    } as never);

    const { lastFrame } = render(
      <WorkflowsScreen environmentId="test-environment-1" onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Signup");
    });
    expect(lastFrame()).toContain("test-signup");
    expect(lastFrame()).toContain("active");
  });

  it("calls onSelect with the workflow's publicId on Enter", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [testWorkflow], limit: 100, offset: 0 },
    } as never);

    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(
      <WorkflowsScreen
        environmentId="test-environment-1"
        onSelect={onSelect}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Signup");
    });

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("test-workflow-1");
  });

  it("shows an empty-state hint when there are no workflows", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [], limit: 100, offset: 0 },
    } as never);

    const { lastFrame } = render(
      <WorkflowsScreen environmentId="test-environment-1" onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No workflows");
    });
  });

  it("shows an error when the environment isn't found", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <WorkflowsScreen environmentId="test-environment-1" onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});
