import { describe, expect, it, vi } from "vitest";

import { readCliConfig } from "@subscriber.dev/shared";

import { ensureLoggedIn } from "../auth.js";

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

describe("ensureLoggedIn", () => {
  it("does nothing when a session is stored", () => {
    vi.mocked(readCliConfig).mockReturnValue({ token: "test-token" });

    expect(() => ensureLoggedIn()).not.toThrow();
  });

  it("errors and exits when no session is stored", () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => ensureLoggedIn()).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Not logged in"),
    );

    exitSpy.mockRestore();
  });
});
