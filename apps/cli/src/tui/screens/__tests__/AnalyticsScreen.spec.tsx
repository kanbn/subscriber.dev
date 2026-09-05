import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { getAnalytics } from "@subscriber.dev/api-client/cli";

import { AnalyticsScreen } from "../AnalyticsScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getAnalytics: vi.fn(),
}));

const testAnalytics = {
  days: 30,
  subscribers: { total: 100, newInPeriod: 5, optedOut: 3, optedOutInPeriod: 1 },
  sends: {
    sent: 90,
    failed: 2,
    skipped: 1,
    pending: 0,
    bounced: 2,
    successRate: 0.9782608695652174,
  },
  bounces: { hard: 1, soft: 1 },
};

describe("AnalyticsScreen", () => {
  it("renders subscriber, send, and bounce stats", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testAnalytics,
    } as never);

    const { lastFrame } = render(
      <AnalyticsScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("total: 100");
    });
    expect(lastFrame()).toContain("new (last 30d): 5");
    expect(lastFrame()).toContain("opted out: 3");
    expect(lastFrame()).toContain("opted out (last 30d): 1");
    expect(lastFrame()).toContain("sent: 90");
    expect(lastFrame()).toContain("failed: 2");
    expect(lastFrame()).toContain("success rate: 97.8%");
    expect(lastFrame()).toContain("hard: 1");
    expect(lastFrame()).toContain("soft: 1");
  });

  it("shows a dash for success rate when there have been no sends yet", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        ...testAnalytics,
        sends: {
          ...testAnalytics.sends,
          sent: 0,
          failed: 0,
          successRate: null,
        },
      },
    } as never);

    const { lastFrame } = render(
      <AnalyticsScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("success rate: —");
    });
  });

  it("shows an error when the environment isn't found", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = render(
      <AnalyticsScreen environmentId="test-environment-1" />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});
