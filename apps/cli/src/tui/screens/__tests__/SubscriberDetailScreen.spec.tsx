import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  deleteSubscriber,
  getSubscriber,
} from "@subscriber.dev/api-client/cli";

import { SubscriberDetailScreen } from "../SubscriberDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
}));

const testSubscriber = {
  publicId: "test-subscriber-1",
  email: "test@example.com",
  phone: null,
  externalId: null,
  firstName: "Ada",
  lastName: "Lovelace",
  name: "should not be used",
};

function renderScreen(onDeleted = vi.fn()) {
  return {
    onDeleted,
    ...render(
      <SubscriberDetailScreen
        environmentId="test-environment-1"
        subscriberId="test-subscriber-1"
        onDeleted={onDeleted}
      />,
    ),
  };
}

describe("SubscriberDetailScreen", () => {
  it("prefers first + last name over the free-text name field", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: { email: true } },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: Ada Lovelace");
    });
    expect(lastFrame()).toContain("email: test@example.com");
    expect(lastFrame()).toContain("phone: —");
    expect(lastFrame()).toContain("emailOptedIn: true");
  });

  it("falls back to the free-text name field when first/last are absent", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        subscriber: {
          publicId: "test-subscriber-1",
          email: null,
          phone: null,
          externalId: null,
          firstName: null,
          lastName: null,
          name: "Free Text Name",
        },
        preferences: null,
      },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: Free Text Name");
    });
    expect(lastFrame()).toContain("emailOptedIn: —");
  });

  it("falls back to em dash when no name is available at all", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        subscriber: {
          publicId: "test-subscriber-1",
          email: null,
          phone: null,
          externalId: null,
          firstName: null,
          lastName: null,
          name: null,
        },
        preferences: null,
      },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: —");
    });
  });

  it("shows an error when the subscriber isn't found", async () => {
    vi.mocked(getSubscriber).mockResolvedValue({
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

describe("SubscriberDetailScreen delete", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber, preferences: { email: true } },
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("name: Ada Lovelace");
    });
    return screen;
  }

  it("shows a confirm prompt when 'd' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Delete subscriber test-subscriber-1? This cannot be undone.",
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
    expect(deleteSubscriber).not.toHaveBeenCalled();
  });
});
