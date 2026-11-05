import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  listIntegrations,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import { IntegrationsScreen } from "../IntegrationsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listIntegrations: vi.fn(),
  upsertIntegration: vi.fn(),
}));

const testIntegration = { type: "smtp", updatedAt: "2026-01-01T00:00:00.000Z" };

describe("IntegrationsScreen primary badge", () => {
  it("labels the first integration as primary, matching the priority-ordered response", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        integrations: [
          { type: "cloudflare", updatedAt: "2026-01-01T00:00:00.000Z" },
          { type: "smtp", updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
    } as never);

    const { lastFrame } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("cloudflare (primary)");
    });
    expect(lastFrame()).not.toContain("smtp (primary)");
  });
});

describe("IntegrationsScreen", () => {
  it("lists integrations by type", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [testIntegration] },
    } as never);

    const { lastFrame } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("smtp");
    });
  });

  it("calls onSelect with the type on Enter", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [testIntegration] },
    } as never);

    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={onSelect}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("smtp");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    stdin.write("\r");

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("smtp");
    });
  });

  it("shows an empty-state hint when there are none", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [] },
    } as never);

    const { lastFrame } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No integrations configured.");
    });
  });

  it("shows an error on a 404", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("IntegrationsScreen create", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it("shows the type chooser when 'n' is pressed", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [testIntegration] },
    } as never);

    const { lastFrame, stdin } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("smtp");
    });

    await tick();
    stdin.write("n");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New integration");
    });
    expect(lastFrame()).toContain("SMTP");
    expect(lastFrame()).toContain("Cloudflare Email");
    expect(lastFrame()).toContain("Stripe (trigger workflows)");
  });

  it("shows the SMTP field menu after choosing SMTP (the default option)", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [testIntegration] },
    } as never);

    const { lastFrame, stdin } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("smtp");
    });

    await tick();
    stdin.write("n");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New integration");
    });

    // "SMTP" is the default-selected (first) option.
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New SMTP integration");
    });
    expect(lastFrame()).toContain("Host: —");
    expect(lastFrame()).toContain("Secure: Yes");
    expect(lastFrame()).toContain("Create integration");
  });

  it("fills in the default field before creating", async () => {
    vi.mocked(listIntegrations).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { integrations: [] },
    } as never);

    const { lastFrame, stdin } = render(
      <IntegrationsScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No integrations configured.");
    });

    await tick();
    stdin.write("n");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New integration");
    });

    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New SMTP integration");
    });

    // Default-selected item is "Host" (the first field).
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Create integration");
    });

    await tick();
    stdin.write("smtp.example.com");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Host: smtp.example.com");
    });
    expect(upsertIntegration).not.toHaveBeenCalled();
  });
});
