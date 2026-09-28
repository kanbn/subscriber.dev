import type * as Ink from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  getSubscriber,
  getWorkspaces,
  listEnvironments,
  listSubscribers,
} from "@subscriber.dev/api-client/cli";

import { App } from "../App.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkspaces: vi.fn(),
  listEnvironments: vi.fn(),
  listSubscribers: vi.fn(),
  getSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  triggerWorkflow: vi.fn(),
  listWorkflowRuns: vi.fn(),
  listEnvironmentRuns: vi.fn(),
  triggerBroadcast: vi.fn(),
  listBroadcasts: vi.fn(),
  getBroadcast: vi.fn(),
  pauseBroadcast: vi.fn(),
  resumeBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
  redispatchBroadcast: vi.fn(),
  listIntegrations: vi.fn(),
  getIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const exitMock = vi.fn();
vi.mock("ink", async (importOriginal) => {
  const actual = await importOriginal<typeof Ink>();
  return {
    ...actual,
    useApp: () => ({ exit: exitMock }),
  };
});

const testWorkspace = {
  id: 1,
  publicId: "test-workspace-1",
  name: "Test Workspace",
  slug: "test-workspace",
};
const testEnvironment = {
  id: 1,
  publicId: "test-environment-1",
  name: "Staging",
  slug: "staging",
};
const testSubscriber = {
  publicId: "test-subscriber-1",
  email: "test@example.com",
  phone: null,
  externalId: null,
  firstName: null,
  lastName: null,
  name: null,
};

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("App navigation", () => {
  it("drills from workspaces down to a subscriber's detail, then backs out with Escape", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);
    vi.mocked(listEnvironments).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { environments: [testEnvironment] },
    } as never);
    vi.mocked(listSubscribers).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscribers: [testSubscriber], limit: 100, offset: 0 },
    } as never);
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: null },
    } as never);

    const { lastFrame, stdin } = render(<App />);

    // Workspaces screen -> select the only workspace
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });
    stdin.write("\r");

    // Environments screen -> select the only environment
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Staging");
    });
    stdin.write("\r");

    // Section screen -> "Subscribers" is the first item
    await tick();
    expect(lastFrame()).toContain("Subscribers");
    stdin.write("\r");

    // Subscribers screen -> select the only subscriber
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test@example.com");
    });
    stdin.write("\r");

    // Subscriber detail screen
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("publicId: test-subscriber-1");
    });

    // Escape pops back one level, to the subscribers list
    stdin.write("\u001B");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test@example.com");
    });
    expect(lastFrame()).not.toContain("publicId: test-subscriber-1");
  });

  it("navigates to My Account and back with Escape", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [],
    } as never);
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        publicId: "test-user-1",
        name: "Test User",
        email: "test@example.com",
        image: null,
        stripeCustomerId: null,
        apiKeys: [],
      },
    } as never);

    const { lastFrame, stdin } = render(<App />);

    // With no workspaces, "My Account" is the only (and default) item.
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("My Account");
    });
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: Test User");
    });

    stdin.write("\u001B");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No workspaces yet");
    });
  });

  it("quits on 'q'", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const { lastFrame, stdin } = render(<App />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });

    stdin.write("q");

    expect(exitMock).toHaveBeenCalled();
  });
});
