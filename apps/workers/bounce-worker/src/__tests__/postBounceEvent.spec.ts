import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postBounceEvent } from "../postBounceEvent.js";

const env = {
  BOUNCE_WEBHOOK_URL: "https://api.example.com",
  BOUNCE_WEBHOOK_SECRET: "test-secret",
};

const payload = {
  runStepPublicId: "run_abc123",
  bounceType: "hard" as const,
  reason: "no such user",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postBounceEvent", () => {
  it("POSTs to /bounces/inbound with the bearer secret and JSON payload", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202 });

    await postBounceEvent(env, payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/bounces/inbound",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: JSON.stringify(payload),
      },
    );
  });

  it("treats a 404 (unknown run step) as a no-op, not an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Run step not found"),
    });

    await expect(postBounceEvent(env, payload)).resolves.toBeUndefined();
  });

  it("throws on other non-2xx responses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal error"),
    });

    await expect(postBounceEvent(env, payload)).rejects.toThrow(
      "Bounce webhook responded with 500",
    );
  });
});
