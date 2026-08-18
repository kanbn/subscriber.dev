import { describe, expect, it } from "vitest";

import {
  classifyBounce,
  extractReason,
  extractRunStepToken,
  isBounceNotification,
} from "../bounceDetection.js";

describe("isBounceNotification", () => {
  it("recognizes mailer-daemon and postmaster senders", () => {
    expect(
      isBounceNotification({
        from: "Mail Delivery Subsystem <mailer-daemon@example.com>",
        subject: "hi",
        text: "",
      }),
    ).toBe(true);
    expect(
      isBounceNotification({
        from: "postmaster@example.com",
        subject: "hi",
        text: "",
      }),
    ).toBe(true);
  });

  it("recognizes common bounce subject lines regardless of sender", () => {
    expect(
      isBounceNotification({
        from: "random@example.com",
        subject: "Mail Delivery Failed: returning message to sender",
        text: "",
      }),
    ).toBe(true);
    expect(
      isBounceNotification({
        from: "random@example.com",
        subject: "Undelivered Mail Returned to Sender",
        text: "",
      }),
    ).toBe(true);
  });

  it("returns false for an ordinary email", () => {
    expect(
      isBounceNotification({
        from: "alice@example.com",
        subject: "Re: catch up next week?",
        text: "Sounds good!",
      }),
    ).toBe(false);
  });
});

describe("classifyBounce", () => {
  it("classifies enhanced status code 5.x.x and common hard-bounce phrasing as hard", () => {
    expect(classifyBounce("550 5.1.1 The email account does not exist")).toBe(
      "hard",
    );
    expect(classifyBounce("Recipient address rejected: User unknown")).toBe(
      "hard",
    );
  });

  it("classifies enhanced status code 4.x.x and common soft-bounce phrasing as soft", () => {
    expect(classifyBounce("450 4.2.2 Mailbox full")).toBe("soft");
    expect(classifyBounce("Over quota, try again later")).toBe("soft");
  });

  it("defaults unclassifiable text to hard", () => {
    expect(classifyBounce("Something went wrong, no idea what")).toBe("hard");
  });
});

describe("extractRunStepToken", () => {
  it("extracts the token from a VERP bounce address", () => {
    expect(extractRunStepToken("bounce+run_abc123@bounces.example.com")).toBe(
      "run_abc123",
    );
  });

  it("returns null for a recipient that isn't a VERP bounce address", () => {
    expect(extractRunStepToken("someone@example.com")).toBeNull();
    expect(extractRunStepToken("admin@bounces.example.com")).toBeNull();
  });
});

describe("extractReason", () => {
  it("collapses whitespace and trims", () => {
    expect(extractReason("  550   no such\n\nuser  ")).toBe("550 no such user");
  });

  it("falls back to a default message for empty text", () => {
    expect(extractReason("   ")).toBe("Unknown bounce reason");
  });

  it("truncates very long reasons", () => {
    const long = "x".repeat(600);
    const result = extractReason(long);
    expect(result.length).toBe(501);
    expect(result.endsWith("…")).toBe(true);
  });
});
