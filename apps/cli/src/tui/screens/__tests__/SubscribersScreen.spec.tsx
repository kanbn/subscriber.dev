import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { listSubscribers } from "@subscriber.dev/api-client/cli";

import { SubscribersScreen } from "../SubscribersScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listSubscribers: vi.fn(),
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

function listSubscribersMock(data: { subscribers: unknown[] }) {
  vi.mocked(listSubscribers).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { ...data, limit: 100, offset: 0 },
  } as never);
}
