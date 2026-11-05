import { describe, expect, it } from "vitest";

import { isNewer } from "../updateCheck.js";

describe("isNewer", () => {
  it("compares versions numerically", () => {
    expect(isNewer("0.1.2", "0.1.1")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("0.1.1", "0.1.1")).toBe(false);
    expect(isNewer("0.1.0", "0.1.1")).toBe(false);
  });
});
