import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listEnvironments } from "@subscriber.dev/api-client/cli";

import { EnvironmentsScreen } from "../EnvironmentsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listEnvironments: vi.fn(),
}));

const testWorkspace = { publicId: "test-workspace-1", name: "Test Workspace" };
const testEnvironment = { publicId: "test-environment-1", name: "Staging" };

describe("EnvironmentsScreen", () => {
  it("lists environments once fetched", async () => {
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [testEnvironment] },
    } as never);

    const { lastFrame } = render(
      <EnvironmentsScreen workspace={testWorkspace} onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Staging");
    });
    expect(lastFrame()).toContain("Test Workspace");
  });

  it("calls onSelect with the chosen environment on Enter", async () => {
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [testEnvironment] },
    } as never);

    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(
      <EnvironmentsScreen workspace={testWorkspace} onSelect={onSelect} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Staging");
    });

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith(testEnvironment);
  });

  it("shows an empty-state hint when there are no environments", async () => {
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [] },
    } as never);

    const { lastFrame } = render(
      <EnvironmentsScreen workspace={testWorkspace} onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No environments");
    });
  });

  it("shows an error when the workspace lookup fails", async () => {
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <EnvironmentsScreen workspace={testWorkspace} onSelect={vi.fn()} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});
