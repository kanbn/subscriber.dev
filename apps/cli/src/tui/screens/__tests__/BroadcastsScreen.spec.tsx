import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  cancelBroadcast,
  getBroadcast,
  listBroadcasts,
  pauseBroadcast,
  redispatchBroadcast,
} from "@subscriber.dev/api-client/cli";

import { BroadcastsScreen } from "../BroadcastsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  listBroadcasts: vi.fn(),
  getBroadcast: vi.fn(),
  pauseBroadcast: vi.fn(),
  resumeBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
  redispatchBroadcast: vi.fn(),
}));

const testBroadcast = {
  publicId: "test-broadcast-1",
  status: "queued",
  matchedCount: 42,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const testDetail = {
  publicId: "test-broadcast-1",
  status: "queued",
  matchedCount: 42,
  sendOverHours: 24,
  createdAt: "2026-01-01T00:00:00.000Z",
  sentCount: 10,
  failedCount: 1,
  skippedCount: 2,
  pendingCount: 29,
  bouncedCount: 1,
  hardBounceCount: 0,
  softBounceCount: 1,
  successRate: 10 / 11,
};

function listBroadcastsMock(broadcasts: unknown[]) {
  vi.mocked(listBroadcasts).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { broadcasts, limit: 50, offset: 0 },
  } as never);
}

describe("BroadcastsScreen", () => {
  it("lists each broadcast with its status and matched count", async () => {
    listBroadcastsMock([testBroadcast]);

    const { lastFrame } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("queued");
    });
    expect(lastFrame()).toContain("42 matched");
  });

  it("shows an empty-state hint when there are no broadcasts", async () => {
    listBroadcastsMock([]);

    const { lastFrame } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("No broadcasts yet.");
    });
  });

  it("shows an error when the workflow isn't found", async () => {
    vi.mocked(listBroadcasts).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="missing"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("BroadcastsScreen detail", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it("fetches and shows step-outcome counts when a broadcast is selected", async () => {
    listBroadcastsMock([testBroadcast]);
    vi.mocked(getBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testDetail,
    } as never);

    const { lastFrame, stdin } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("queued");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("sent: 10");
    });
    expect(getBroadcast).toHaveBeenCalledWith(
      "test-workflow-1",
      "test-broadcast-1",
    );
    expect(lastFrame()).toContain("failed: 1");
    expect(lastFrame()).toContain("skipped: 2");
    expect(lastFrame()).toContain("pending: 29");
    expect(lastFrame()).toContain("bounced: 1 (hard 0, soft 1)");
    expect(lastFrame()).toContain("success rate: 90.9%");
  });

  it("returns to the list when 'b' is pressed", async () => {
    listBroadcastsMock([testBroadcast]);
    vi.mocked(getBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testDetail,
    } as never);

    const { lastFrame, stdin } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("queued");
    });

    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("sent: 10");
    });

    await tick();
    stdin.write("b");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("sent: 10");
    });
    expect(lastFrame()).toContain("42 matched");
  });

  it("shows an error when the broadcast fetch fails", async () => {
    listBroadcastsMock([testBroadcast]);
    vi.mocked(getBroadcast).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame, stdin } = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("queued");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });

  async function openDetail() {
    listBroadcastsMock([testBroadcast]);
    vi.mocked(getBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testDetail,
    } as never);
    const screen = render(
      <BroadcastsScreen
        environmentId="test-environment-1"
        workflowId="test-workflow-1"
      />,
    );
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("queued");
    });
    await tick();
    screen.stdin.write("\r");
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("sent: 10");
    });
    return screen;
  }

  it("shows the send window", async () => {
    const { lastFrame } = await openDetail();

    expect(lastFrame()).toContain("send window: spread over 24h");
  });

  it("pauses with 'p' and refreshes the detail", async () => {
    vi.mocked(pauseBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testBroadcast, status: "paused" },
    } as never);
    const { lastFrame, stdin } = await openDetail();
    vi.mocked(getBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testDetail, status: "paused" },
    } as never);

    await tick();
    stdin.write("p");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Paused.");
    });
    expect(lastFrame()).toContain("status: paused");
    expect(pauseBroadcast).toHaveBeenCalledWith(
      "test-workflow-1",
      "test-broadcast-1",
    );
  });

  it("explains when an action isn't allowed in the current status", async () => {
    vi.mocked(pauseBroadcast).mockResolvedValue({
      status: 409,
      headers: new Headers(),
      data: undefined,
    } as never);
    const { lastFrame, stdin } = await openDetail();

    await tick();
    stdin.write("p");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Can't pause a broadcast that's queued.");
    });
  });

  it("asks for confirmation before cancelling, defaulting to keep it", async () => {
    const { lastFrame, stdin } = await openDetail();

    await tick();
    stdin.write("c");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Cancel this broadcast?");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Cancel this broadcast?");
    });
    expect(cancelBroadcast).not.toHaveBeenCalled();
  });

  it("cancels once confirmed", async () => {
    vi.mocked(cancelBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { ...testBroadcast, status: "cancelled" },
    } as never);
    const { lastFrame, stdin } = await openDetail();

    await tick();
    stdin.write("c");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Cancel this broadcast?");
    });
    await tick();
    stdin.write("\u001B[A");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Cancelled.");
    });
    expect(cancelBroadcast).toHaveBeenCalledWith(
      "test-workflow-1",
      "test-broadcast-1",
    );
  });

  it("sets up missing subscribers with 's' once confirmed", async () => {
    vi.mocked(redispatchBroadcast).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testBroadcast,
    } as never);
    const { lastFrame, stdin } = await openDetail();

    await tick();
    stdin.write("s");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("hasn't been set up yet?");
    });
    await tick();
    stdin.write("\u001B[A");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Setting up remaining subscribers.");
    });
    expect(redispatchBroadcast).toHaveBeenCalledWith(
      "test-workflow-1",
      "test-broadcast-1",
    );
  });
});
