import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  deleteIntegration,
  getIntegration,
} from "@subscriber.dev/api-client/cli";

import { IntegrationDetailScreen } from "../IntegrationDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
}));

function renderScreen(onDeleted = vi.fn()) {
  return {
    onDeleted,
    ...render(
      <IntegrationDetailScreen
        environmentId="test-environment-1"
        type="smtp"
        onDeleted={onDeleted}
      />,
    ),
  };
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe("IntegrationDetailScreen", () => {
  it("renders every field returned, including provider-specific ones", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        type: "smtp",
        host: "smtp.example.com",
        port: 587,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("type: smtp");
    });
    expect(lastFrame()).toContain("host: smtp.example.com");
    expect(lastFrame()).toContain("port: 587");
  });

  it("shows an error when the integration isn't found", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("IntegrationDetailScreen delete", () => {
  async function loaded() {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { type: "smtp", updatedAt: "2026-01-01T00:00:00.000Z" },
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("type: smtp");
    });
    return screen;
  }

  it("shows a confirm prompt when 'd' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        'Remove integration "smtp"? This cannot be undone.',
      );
    });
  });

  it("cancels without calling the API when Enter is pressed immediately (default is cancel)", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("This cannot be undone.");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("This cannot be undone.");
    });
    expect(deleteIntegration).not.toHaveBeenCalled();
  });
});
