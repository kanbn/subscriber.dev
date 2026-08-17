import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { createWorkflow, listWorkflows } from "@subscriber.dev/api-client/cli";

import { WorkflowsScreen } from "../WorkflowsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
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
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="automation"
        onSelect={vi.fn()}
      />,
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
        workflowType="automation"
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
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="automation"
        onSelect={vi.fn()}
      />,
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
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="automation"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("WorkflowsScreen with workflowType=broadcast", () => {
  it("filters by type and shows the Broadcasts title", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [], limit: 100, offset: 0 },
    } as never);

    const { lastFrame } = render(
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="broadcast"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No broadcasts");
    });
    expect(lastFrame()).toContain("Broadcasts");
    expect(listWorkflows).toHaveBeenCalledWith(
      "test-environment-1",
      expect.objectContaining({ type: "broadcast" }),
    );
  });
});

describe("WorkflowsScreen create", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it("shows the new-workflow field menu when 'n' is pressed", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [testWorkflow], limit: 100, offset: 0 },
    } as never);

    const { lastFrame, stdin } = render(
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="automation"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Signup");
    });

    await tick();
    stdin.write("n");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New workflow");
    });
    expect(lastFrame()).toContain("Key: —");
    expect(lastFrame()).toContain("Type: Email");
    expect(lastFrame()).toContain("Body: —");
  });

  it("fills in the default field before creating", async () => {
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [], limit: 100, offset: 0 },
    } as never);

    const { lastFrame, stdin } = render(
      <WorkflowsScreen
        environmentId="test-environment-1"
        workflowType="automation"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No workflows");
    });

    await tick();
    stdin.write("n");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New workflow");
    });

    // Default-selected item is "Key" (the first field).
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Type: Email");
    });

    await tick();
    stdin.write("user-signup");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Key: user-signup");
    });
    expect(createWorkflow).not.toHaveBeenCalled();
  });
});
