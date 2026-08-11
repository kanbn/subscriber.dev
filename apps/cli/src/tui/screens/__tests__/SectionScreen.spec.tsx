import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { SectionScreen } from "../SectionScreen.js";

const testWorkspace = { publicId: "test-workspace-1", name: "Test Workspace" };
const testEnvironment = { publicId: "test-environment-1", name: "Staging" };

describe("SectionScreen", () => {
  it("shows the workspace and environment name", () => {
    const { lastFrame } = render(
      <SectionScreen
        workspace={testWorkspace}
        environment={testEnvironment}
        onSelect={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain("Test Workspace");
    expect(lastFrame()).toContain("Staging");
    expect(lastFrame()).toContain("Subscribers");
    expect(lastFrame()).toContain("Workflows");
  });

  it("selects 'subscribers' when it's the first item and Enter is pressed", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <SectionScreen
        workspace={testWorkspace}
        environment={testEnvironment}
        onSelect={onSelect}
      />,
    );

    await new Promise((resolve) => setImmediate(resolve));

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("subscribers");
  });

  it("selects 'workflows' after pressing down then Enter", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <SectionScreen
        workspace={testWorkspace}
        environment={testEnvironment}
        onSelect={onSelect}
      />,
    );

    const tick = () => new Promise((resolve) => setImmediate(resolve));
    await tick();

    stdin.write("\u001B[B"); // down arrow
    await tick();
    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("workflows");
  });
});
