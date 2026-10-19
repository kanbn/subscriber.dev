import type * as Ink from "ink";
import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  getSubscriber,
  getWorkflow,
  getWorkspaces,
  listEnvironments,
  listSubscribers,
  listTriggerSources,
  listWorkflows,
  upsertIntegration,
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
  listInboundEvents: vi.fn(),
  deleteIntegration: vi.fn(),
  getCurrentUser: vi.fn(),
  listTriggerSources: vi.fn(),
  updateWorkflow: vi.fn(),
  upsertIntegration: vi.fn(),
}));

const exitMock = vi.fn();
vi.mock("ink", async (importOriginal) => {
  const actual = await importOriginal<typeof Ink>();
  return {
    ...actual,
    useApp: () => ({ exit: exitMock }),
  };
});

afterEach(cleanup);

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
      expect(lastFrame()).not.toContain("publicId: test-subscriber-1");
    });
    expect(lastFrame()).toContain("test@example.com");
  });

  it("sets up a disconnected trigger source from a workflow's triggers, then returns to pick its events", async () => {
    const workflow = {
      publicId: "wf_1",
      key: "trial-welcome",
      name: "Trial welcome",
      description: null,
      status: "active",
      type: "automation",
      steps: [],
      triggers: [],
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      bouncedCount: 0,
      hardBounceCount: 0,
      softBounceCount: 0,
      successRate: null,
    };
    const stripe = (connected: boolean) => ({
      status: 200,
      headers: new Headers(),
      data: {
        sources: [
          {
            source: "stripe",
            name: "Stripe",
            connected,
            events: [{ name: "trial_started", label: "Trial started" }],
          },
        ],
      },
    });
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
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { workflows: [workflow], limit: 100, offset: 0 },
    } as never);
    vi.mocked(getWorkflow).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: workflow,
    } as never);
    vi.mocked(listTriggerSources)
      .mockResolvedValueOnce(stripe(false) as never)
      .mockResolvedValue(stripe(true) as never);
    vi.mocked(upsertIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {},
    } as never);

    const { lastFrame, stdin } = render(<App />);
    const press = async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      stdin.write(key);
    };
    const DOWN = "\u001B[B";

    await vi.waitFor(() => expect(lastFrame()).toContain("Test Workspace"));
    await press("\r");
    await vi.waitFor(() => expect(lastFrame()).toContain("Staging"));
    await press("\r");
    await vi.waitFor(() => expect(lastFrame()).toContain("Workflows"));
    await press(DOWN);
    await press("\r");
    await vi.waitFor(() => expect(lastFrame()).toContain("Trial welcome"));
    await press("\r");
    await vi.waitFor(() => expect(lastFrame()).toContain("key: trial-welcome"));
    await press("g");
    await vi.waitFor(() => expect(lastFrame()).toContain("+ Add trigger"));
    await press("\r");
    await vi.waitFor(() =>
      expect(lastFrame()).toContain("Stripe · not connected — set it up"),
    );
    await press("\r");

    await vi.waitFor(() =>
      expect(lastFrame()).toContain("New Stripe integration"),
    );
    await press("\r");
    await press("rk_test_1");
    await press("\r");
    await press(DOWN);
    await press(DOWN);
    await press("\r");

    await vi.waitFor(() => expect(lastFrame()).toContain("[ ] Trial started"));
    expect(upsertIntegration).toHaveBeenCalledWith(
      "test-environment-1",
      "stripe",
      expect.objectContaining({ apiKey: "rk_test_1" }),
    );
  });

  it("navigates to My Account and back with Escape", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
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
      },
    } as never);

    const { lastFrame, stdin } = render(<App />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("My Account");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    stdin.write("\u001B[B");
    await new Promise((resolve) => setTimeout(resolve, 50));
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: Test User");
    });

    stdin.write("\u001B");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });
  });

  it("opens setup when there are no workspaces yet", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [],
    } as never);

    const { lastFrame } = render(<App />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Get started");
    });
    expect(lastFrame()).toContain("Name your workspace");
  });

  it("doesn't quit on 'q' while typing in a text field", async () => {
    vi.mocked(getWorkspaces).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: [testWorkspace],
    } as never);

    const { lastFrame, stdin } = render(<App />);
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Test Workspace");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    stdin.write("n");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New workspace");
    });

    for (const character of "Aqua") {
      await new Promise((resolve) => setTimeout(resolve, 20));
      stdin.write(character);
    }

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Aqua");
    });
    expect(exitMock).not.toHaveBeenCalled();
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
