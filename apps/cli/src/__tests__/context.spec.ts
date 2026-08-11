import { describe, expect, it, vi } from "vitest";

import { readCliConfig } from "@subscriber.dev/shared";

import { requireEnvironmentId, requireWorkspaceId } from "../context.js";

vi.mock("@subscriber.dev/shared", () => ({
  readCliConfig: vi.fn(),
}));

describe("requireWorkspaceId", () => {
  it("prefers the explicit option over the stored config", () => {
    vi.mocked(readCliConfig).mockReturnValue({
      currentWorkspaceId: "stored-workspace",
    });

    expect(requireWorkspaceId({ workspace: "explicit-workspace" })).toBe(
      "explicit-workspace",
    );
  });

  it("falls back to the stored config when no option is passed", () => {
    vi.mocked(readCliConfig).mockReturnValue({
      currentWorkspaceId: "stored-workspace",
    });

    expect(requireWorkspaceId({})).toBe("stored-workspace");
  });

  it("errors and exits when neither is set", () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => requireWorkspaceId({})).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No workspace specified"),
    );

    exitSpy.mockRestore();
  });
});

describe("requireEnvironmentId", () => {
  it("prefers the explicit option over the stored config", () => {
    vi.mocked(readCliConfig).mockReturnValue({
      currentEnvironmentId: "stored-environment",
    });

    expect(requireEnvironmentId({ environment: "explicit-environment" })).toBe(
      "explicit-environment",
    );
  });

  it("falls back to the stored config when no option is passed", () => {
    vi.mocked(readCliConfig).mockReturnValue({
      currentEnvironmentId: "stored-environment",
    });

    expect(requireEnvironmentId({})).toBe("stored-environment");
  });

  it("errors and exits when neither is set", () => {
    vi.mocked(readCliConfig).mockReturnValue({});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => requireEnvironmentId({})).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No environment specified"),
    );

    exitSpy.mockRestore();
  });
});
