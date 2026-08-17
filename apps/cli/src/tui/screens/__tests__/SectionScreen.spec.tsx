import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { SectionScreen } from "../SectionScreen.js";

const testWorkspace = { publicId: "test-workspace-1", name: "Test Workspace" };
const testEnvironment = { publicId: "test-environment-1", name: "Staging" };

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

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
    expect(lastFrame()).toContain("Broadcasts");
    expect(lastFrame()).toContain("Run History");
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

    await tick();

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("subscribers");
  });
});
