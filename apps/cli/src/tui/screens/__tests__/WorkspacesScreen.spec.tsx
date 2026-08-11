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

function renderScreen(onSelectWorkspace = vi.fn(), onSelectAccount = vi.fn()) {
  return {
    onSelectWorkspace,
    onSelectAccount,
    ...render(
      <WorkspacesScreen
        onSelectWorkspace={onSelectWorkspace}
        onSelectAccount={onSelectAccount}
      />,
    ),
  };
}

describe("WorkspacesScreen", () => {
  it("shows a loading state, then lists workspaces once fetched", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const { lastFrame } = renderScreen();

    expect(lastFrame()).toContain("Loading");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });
    expect(lastFrame()).toContain("My Account");
  });

  it("calls onSelectWorkspace with the chosen workspace on Enter (workspaces come before My Account)", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const { lastFrame, stdin, onSelectWorkspace, onSelectAccount } =
      renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });

    stdin.write("\r");

    expect(onSelectWorkspace).toHaveBeenCalledWith(testWorkspace);
    expect(onSelectAccount).not.toHaveBeenCalled();
  });

  it("shows an empty-state hint when there are no workspaces", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [],
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No workspaces yet");
    });
    expect(lastFrame()).toContain("My Account");
  });
});
