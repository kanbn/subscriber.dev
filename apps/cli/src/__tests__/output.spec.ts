import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printResult } from "../output.js";

describe("printResult", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let tableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints pretty JSON when --json is passed, regardless of shape", () => {
    printResult({ name: "Example" }, { json: true });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ name: "Example" }, null, 2),
    );
    expect(tableSpy).not.toHaveBeenCalled();
  });

  it("prints '(none)' for an empty array", () => {
    printResult([], {});

    expect(logSpy).toHaveBeenCalledWith("(none)");
    expect(tableSpy).not.toHaveBeenCalled();
  });

  it("renders a table for a non-empty array", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    printResult(rows, {});

    expect(tableSpy).toHaveBeenCalledWith(rows);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs a single object directly when not an array", () => {
    const workspace = { publicId: "test-workspace-1", name: "Test Workspace" };
    printResult(workspace, {});

    expect(logSpy).toHaveBeenCalledWith(workspace);
    expect(tableSpy).not.toHaveBeenCalled();
  });
});
