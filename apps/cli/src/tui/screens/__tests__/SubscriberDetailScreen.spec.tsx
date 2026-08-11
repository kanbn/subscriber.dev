import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  deleteSubscriber,
  getSubscriber,
  updateSubscriber,
  updateSubscriberPreferences,
} from "@subscriber.dev/api-client/cli";

import { SubscriberDetailScreen } from "../SubscriberDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  updateSubscriber: vi.fn(),
  updateSubscriberPreferences: vi.fn(),
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

describe("SubscriberDetailScreen edit fields", () => {
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

  it("shows the field menu with current values when 'e' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Email: test@example.com");
    });
    expect(lastFrame()).toContain("Phone: —");
    expect(lastFrame()).toContain("First name: Ada");
  });

  it("edits a field and saves it, calling updateSubscriber with only that field", async () => {
    vi.mocked(updateSubscriber).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber },
    } as never);

    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Email: test@example.com");
    });

    // Default-selected item is "Email" (the first field). The text input
    // opens pre-filled with the current value and appends at the cursor,
    // so typing extends it rather than replacing it.
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      // The field menu (with every field's row) is gone; only the "Email"
      // text input remains.
      expect(lastFrame()).not.toContain("Phone: —");
    });

    await tick();
    stdin.write(".extra");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Email: test@example.com.extra");
    });
  });
});

describe("SubscriberDetailScreen preferences", () => {
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

  it("shows the opt-in/opt-out selector when 'p' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("p");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Set email opt-in for test-subscriber-1:");
    });
    expect(lastFrame()).toContain("Opted in");
    expect(lastFrame()).toContain("Opted out");
  });

  it("opts the subscriber in with the default selection", async () => {
    vi.mocked(updateSubscriberPreferences).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { subscriber: testSubscriber },
    } as never);

    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("p");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Opted in");
    });

    // "Opted in" is the default-selected (first) item.
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(updateSubscriberPreferences).toHaveBeenCalledWith(
        "test-environment-1",
        "test-subscriber-1",
        { email: true },
      );
    });
  });

  it("shows an error and lets any key dismiss it on failure", async () => {
    vi.mocked(updateSubscriberPreferences).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("p");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Opted in");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error: Subscriber not found.");
    });

    await tick();
    stdin.write("x");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Error");
    });
  });
});
