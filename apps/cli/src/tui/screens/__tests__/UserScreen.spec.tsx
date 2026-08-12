import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  getCurrentUser,
  updateCurrentUser,
} from "@subscriber.dev/api-client/cli";

import { UserScreen } from "../UserScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getCurrentUser: vi.fn(),
  updateCurrentUser: vi.fn(),
}));

const testUser = {
  publicId: "test-user-1",
  name: "Test User",
  email: "test@example.com",
  image: null,
  stripeCustomerId: null,
  apiKeys: [],
};

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

describe("UserScreen edit", () => {
  function tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  async function loaded() {
    vi.mocked(getCurrentUser).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: testUser,
    } as never);
    const screen = render(<UserScreen />);
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("name: Test User");
    });
    return screen;
  }

  it("shows the field menu when 'e' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test User");
    });
    expect(lastFrame()).toContain("Image URL: —");
  });

  it("edits the default field and reflects it in the menu, without saving", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("e");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test User");
    });

    // Default-selected item is "Name" (the first field).
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Image URL: —");
    });

    await tick();
    stdin.write(" Updated");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Name: Test User Updated");
    });
    expect(updateCurrentUser).not.toHaveBeenCalled();
  });
});
