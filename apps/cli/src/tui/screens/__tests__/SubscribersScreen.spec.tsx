import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  createSubscriber,
  listSubscribers,
} from "@subscriber.dev/api-client/cli";

import { SubscribersScreen } from "../SubscribersScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listSubscribers: vi.fn(),
  createSubscriber: vi.fn(),
}));

function subscriber(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    publicId: "test-subscriber-1",
    email: "test@example.com",
    name: null,
    externalId: null,
    ...overrides,
  };
}

describe("SubscribersScreen", () => {
  it("labels each row by email when present", async () => {
    listSubscribersMock({ subscribers: [subscriber()] });

    const { lastFrame } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test@example.com");
    });
  });

  it("falls back to name, then externalId, then publicId when email is missing", async () => {
    listSubscribersMock({
      subscribers: [
        subscriber({
          publicId: "test-subscriber-1",
          email: null,
          name: "Ada Lovelace",
        }),
      ],
    });

    const { lastFrame } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Ada Lovelace");
    });
  });

  it("calls onSelect with the subscriber's publicId on Enter", async () => {
    listSubscribersMock({ subscribers: [subscriber()] });

    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={onSelect}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test@example.com");
    });

    stdin.write("\r");

    expect(onSelect).toHaveBeenCalledWith("test-subscriber-1");
  });

  it("shows an empty-state hint when there are no subscribers", async () => {
    listSubscribersMock({ subscribers: [] });

    const { lastFrame } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No subscribers");
    });
  });
});

describe("SubscribersScreen create", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it("shows the new-subscriber field menu when 'n' is pressed", async () => {
    listSubscribersMock({ subscribers: [subscriber()] });

    const { lastFrame, stdin } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test@example.com");
    });

    await tick();
    stdin.write("n");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New subscriber");
    });
    expect(lastFrame()).toContain("Email: —");
  });

  it("fills in the default field before creating", async () => {
    listSubscribersMock({ subscribers: [] });
    vi.mocked(createSubscriber).mockResolvedValue({
      status: 201,
      headers: new Headers(),
      data: {
        subscriber: { publicId: "test-subscriber-new", email: "a@b.com" },
        preferences: { email: true },
      },
    } as never);

    const { lastFrame, stdin } = render(
      <SubscribersScreen
        environmentId="test-environment-1"
        onSelect={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No subscribers");
    });

    await tick();
    stdin.write("n");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("New subscriber");
    });

    // Default-selected item is "Email" (the first field).
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Email: —");
    });

    await tick();
    stdin.write("a@b.com");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Email: a@b.com");
    });
    expect(createSubscriber).not.toHaveBeenCalled();
  });
});

function listSubscribersMock(data: { subscribers: unknown[] }) {
  vi.mocked(listSubscribers).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { ...data, limit: 100, offset: 0 },
  } as never);
}
