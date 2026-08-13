import { describe, expect, it } from "vitest";

import { stepColor, stepSummary, subscriberLabel } from "../runFormatting.js";

describe("subscriberLabel", () => {
  it("prefers email, then name, then externalId, then publicId", () => {
    expect(
      subscriberLabel({
        publicId: "sub_1",
        email: "a@example.com",
        name: "Alice",
        externalId: "ext_1",
      }),
    ).toBe("a@example.com");
    expect(
      subscriberLabel({
        publicId: "sub_1",
        email: null,
        name: "Alice",
        externalId: "ext_1",
      }),
    ).toBe("Alice");
    expect(
      subscriberLabel({
        publicId: "sub_1",
        email: null,
        name: null,
        externalId: "ext_1",
      }),
    ).toBe("ext_1");
    expect(
      subscriberLabel({
        publicId: "sub_1",
        email: null,
        name: null,
        externalId: null,
      }),
    ).toBe("sub_1");
  });
});

describe("stepSummary", () => {
  it("counts sent steps and appends a failed count when any failed", () => {
    expect(
      stepSummary([
        { status: "sent" },
        { status: "sent" },
        { status: "pending" },
      ]),
    ).toBe("2/3 sent");
    expect(stepSummary([{ status: "sent" }, { status: "failed" }])).toBe(
      "1/2 sent, 1 failed",
    );
  });
});

describe("stepColor", () => {
  it("colors sent green and failed red, otherwise undefined", () => {
    expect(stepColor("sent")).toBe("green");
    expect(stepColor("failed")).toBe("red");
    expect(stepColor("pending")).toBeUndefined();
  });
});
