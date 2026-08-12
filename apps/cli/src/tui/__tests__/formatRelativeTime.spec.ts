import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "../formatRelativeTime.js";

const now = new Date("2026-01-01T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("formats seconds ago", () => {
    expect(formatRelativeTime("2026-01-01T11:59:30.000Z", now)).toBe(
      "30 seconds ago",
    );
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime("2026-01-01T11:55:00.000Z", now)).toBe(
      "5 minutes ago",
    );
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime("2026-01-01T09:00:00.000Z", now)).toBe(
      "3 hours ago",
    );
  });

  it("formats days ago", () => {
    expect(formatRelativeTime("2025-12-30T12:00:00.000Z", now)).toBe(
      "2 days ago",
    );
  });

  it("falls back to a date string beyond 30 days", () => {
    expect(formatRelativeTime("2025-10-01T12:00:00.000Z", now)).toBe(
      "2025-10-01",
    );
  });
});
