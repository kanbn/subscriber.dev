import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@subscriber.dev/api-client/cli";

import { UserScreen } from "../UserScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getCurrentUser: vi.fn(),
}));

describe("UserScreen", () => {
  it("renders the current user's fields", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        publicId: "test-user-1",
        name: "Test User",
        email: "test@example.com",
        image: null,
        stripeCustomerId: null,
        apiKeys: [],
      },
    } as never);

    const { lastFrame } = render(<UserScreen />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: Test User");
    });
    expect(lastFrame()).toContain("email: test@example.com");
    expect(lastFrame()).toContain("publicId: test-user-1");
    expect(lastFrame()).toContain("image: —");
  });

  it("falls back to em dash when name is absent", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        publicId: "test-user-1",
        name: null,
        email: "test@example.com",
        image: null,
        stripeCustomerId: null,
        apiKeys: [],
      },
    } as never);

    const { lastFrame } = render(<UserScreen />);

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("name: —");
    });
  });
});
