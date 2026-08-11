import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { getWorkspaces } from "@subscriber.dev/api-client/cli";

import { WorkspacesScreen } from "../WorkspacesScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkspaces: vi.fn(),
}));

const testWorkspace = {
  id: 1,
  publicId: "test-workspace-1",
  name: "Test Workspace",
  slug: "test-workspace",
};

describe("WorkspacesScreen", () => {
  it("shows a loading state, then lists workspaces once fetched", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const { lastFrame } = render(<WorkspacesScreen onSelect={vi.fn()} />);

    expect(lastFrame()).toContain("Loading");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });
  });

  it("calls onSelect with the chosen workspace on Enter", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(
      <WorkspacesScreen onSelect={onSelect} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith(testWorkspace);
  });

  it("shows an empty-state hint when there are no workspaces", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [],
    } as never);

    const { lastFrame } = render(<WorkspacesScreen onSelect={vi.fn()} />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No workspaces");
    });
  });
});
