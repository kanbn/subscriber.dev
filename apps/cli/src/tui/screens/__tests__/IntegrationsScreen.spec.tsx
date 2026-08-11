import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listIntegrations } from "@subscriber.dev/api-client/cli";

import { IntegrationsScreen } from "../IntegrationsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listIntegrations: vi.fn(),
}));

const testIntegration = { type: "smtp", updatedAt: "2026-01-01T00:00:00.000Z" };

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

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("smtp");
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
