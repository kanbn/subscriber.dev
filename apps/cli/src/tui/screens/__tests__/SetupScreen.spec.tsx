import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bulkUpsertSubscribers,
  createWorkflow,
  createWorkspace,
  getCurrentUser,
  getSetup,
  listWorkflowRuns,
  listWorkflows,
  triggerWorkflow,
} from "@subscriber.dev/api-client/cli";

import { mcpServerUrl, SetupScreen } from "../SetupScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  bulkUpsertSubscribers: vi.fn(),
  createWorkflow: vi.fn(),
  createWorkspace: vi.fn(),
  getCurrentUser: vi.fn(),
  getSetup: vi.fn(),
  listIntegrations: vi.fn(),
  listWorkflowRuns: vi.fn(),
  listWorkflows: vi.fn(),
  sendTestEmail: vi.fn(),
  triggerWorkflow: vi.fn(),
  upsertIntegration: vi.fn(),
}));

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: () => ({ apiBaseUrl: "https://api.subscriber.dev" }),
}));

afterEach(cleanup);

const workspace = { publicId: "ws-1", name: "Acme" };
const environment = { publicId: "env-1", name: "Production" };
const welcome = {
  publicId: "wf-1",
  key: "welcome",
  editUrl: "https://subscriber.dev/editor/env-1/wf-1",
};

function tick(ms = 30) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function type(stdin: { write: (data: string) => void }, text: string) {
  for (const character of text) {
    await tick(10);
    stdin.write(character);
  }
  await tick(10);
}

function setupAt(next: string | null) {
  vi.mocked(getSetup).mockResolvedValue({
    status: 200,
    data: { complete: next === null, next, steps: [], suggestions: [] },
  } as never);
}

describe("SetupScreen", () => {
  it("creates a workspace, then asks for an email provider", async () => {
    vi.mocked(createWorkspace).mockResolvedValue({
      status: 201,
      data: { workspace, environment },
    } as never);

    const { lastFrame, stdin } = render(<SetupScreen onDone={vi.fn()} />);
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name your workspace");
    });

    await type(stdin, "Acme");
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Which email provider");
    });
    expect(createWorkspace).toHaveBeenCalledWith({ name: "Acme" });
    expect(lastFrame()).toContain("Resend");
  });

  it("creates a welcome workflow named after the product", async () => {
    setupAt("first_workflow");
    vi.mocked(createWorkflow).mockResolvedValue({
      status: 201,
      data: welcome,
    } as never);

    const { lastFrame, stdin } = render(
      <SetupScreen
        workspace={workspace}
        environment={environment}
        onDone={vi.fn()}
      />,
    );
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("What's your product called?");
    });

    await type(stdin, "Acme <App>");
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("trigger the welcome workflow");
    });
    expect(createWorkflow).toHaveBeenCalledWith(
      "env-1",
      expect.objectContaining({
        key: "welcome",
        steps: [
          expect.objectContaining({
            type: "email",
            subject: "Welcome to Acme <App>",
            body: expect.stringContaining(
              "signing up to Acme &lt;App&gt;.",
            ) as string,
          }),
        ],
      }),
    );
  });

  it("sends the first email to you and finishes with the MCP line", async () => {
    setupAt("first_email_sent");
    vi.mocked(listWorkflows).mockResolvedValue({
      status: 200,
      data: { workflows: [welcome] },
    } as never);
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      data: { email: "henry@acme.com", name: "Henry Ball" },
    } as never);
    vi.mocked(bulkUpsertSubscribers).mockResolvedValue({
      status: 200,
    } as never);
    vi.mocked(triggerWorkflow).mockResolvedValue({
      status: 200,
      data: { triggered: true },
    } as never);
    vi.mocked(listWorkflowRuns).mockResolvedValue({
      status: 200,
      data: { runs: [{ steps: [{ status: "sent", errorMessage: null }] }] },
    } as never);
    const onDone = vi.fn();

    const { lastFrame, stdin } = render(
      <SetupScreen
        workspace={workspace}
        environment={environment}
        onDone={onDone}
      />,
    );
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("trigger the welcome workflow");
    });

    stdin.write("\r");

    await vi.waitFor(
      () => {
        expect(lastFrame()).toContain("You're set up");
      },
      { timeout: 3000 },
    );
    expect(bulkUpsertSubscribers).toHaveBeenCalledWith("env-1", {
      subscribers: [{ email: "henry@acme.com", firstName: "Henry" }],
    });
    expect(triggerWorkflow).toHaveBeenCalledWith("env-1", {
      key: "welcome",
      subscriber: { email: "henry@acme.com" },
    });
    expect(lastFrame()).toContain("Sent to henry@acme.com");
    expect(lastFrame()).toContain("https://mcp.subscriber.dev/mcp");

    stdin.write("\r");
    expect(onDone).toHaveBeenCalledWith(workspace, environment);
  });
});

describe("mcpServerUrl", () => {
  it("uses mcp.subscriber.dev for cloud and /mcp on a self-hosted API", () => {
    expect(mcpServerUrl(undefined)).toBe("https://mcp.subscriber.dev/mcp");
    expect(mcpServerUrl("https://api.acme.com/")).toBe(
      "https://api.acme.com/mcp",
    );
  });
});
