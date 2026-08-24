import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cloudflareEmailProvider } from "../cloudflareEmail.provider.js";

const config = {
  accountId: "acct_123",
  fromEmail: "hello@mail.kan.bn",
  fromName: "Henry from Kan",
};

const secret = { apiToken: "test-token" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("send", () => {
  it("POSTs to the sending endpoint with the bearer token and a derived text part", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          errors: [],
          result: { message_id: "msg-123" },
        }),
    });

    const result = await cloudflareEmailProvider.send(config, secret, {
      to: "alice@example.com",
      subject: "Hi Alice",
      html: "<p>Welcome <strong>Alice</strong>!</p>",
    });

    expect(result).toEqual({ providerMessageId: "msg-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct_123/email/sending/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({
      to: "alice@example.com",
      from: { address: "hello@mail.kan.bn", name: "Henry from Kan" },
      subject: "Hi Alice",
      html: "<p>Welcome <strong>Alice</strong>!</p>",
      text: "Welcome Alice!",
    });
  });

  it("sends a plain address for from when no fromName is configured", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          errors: [],
          result: { message_id: "msg-123" },
        }),
    });

    await cloudflareEmailProvider.send(
      { accountId: "acct_123", fromEmail: "hello@mail.kan.bn" },
      secret,
      { to: "alice@example.com", subject: "Hi", html: "<p>Hi</p>" },
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toBe("hello@mail.kan.bn");
  });

  it("throws with Cloudflare's error message when the send fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          errors: [{ code: 1000, message: "Sender domain not verified" }],
          result: null,
        }),
    });

    await expect(
      cloudflareEmailProvider.send(config, secret, {
        to: "alice@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
      }),
    ).rejects.toThrow("Sender domain not verified");
  });
});

describe("verify", () => {
  it("resolves when the token/account can access the sending limits endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, result: { quota: {} } }),
    });

    await expect(
      cloudflareEmailProvider.verify!(config, secret),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct_123/email/sending/limits",
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("throws with Cloudflare's error message when the token is invalid", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          errors: [{ code: 9109, message: "Invalid API token" }],
        }),
    });

    await expect(
      cloudflareEmailProvider.verify!(config, secret),
    ).rejects.toThrow("Invalid API token");
  });
});

describe("checkBounces", () => {
  it("fetches the suppression list and maps entries to hard bounces", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          page: 1,
          per_page: 1000,
          total: 2,
          result: [
            {
              email: "bounced1@example.com",
              reason: "hard_bounce",
              created_at: "2026-08-24T10:00:00Z",
            },
            {
              email: "bounced2@example.com",
              reason: "hard_bounce",
              created_at: "2026-08-24T09:00:00Z",
            },
          ],
        }),
    });

    const events = await cloudflareEmailProvider.checkBounces!(config, secret);

    expect(events).toEqual([
      {
        email: "bounced1@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T10:00:00Z"),
      },
      {
        email: "bounced2@example.com",
        bounceType: "hard",
        reason: "hard_bounce",
        occurredAt: new Date("2026-08-24T09:00:00Z"),
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct_123/email/sending/suppression?page=1&per_page=1000&order=created_at&direction=desc",
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("paginates until every suppressed entry has been fetched", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            page: 1,
            per_page: 1,
            total: 2,
            result: [
              {
                email: "bounced1@example.com",
                reason: "hard_bounce",
                created_at: "2026-08-24T10:00:00Z",
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            page: 2,
            per_page: 1,
            total: 2,
            result: [
              {
                email: "bounced2@example.com",
                reason: "hard_bounce",
                created_at: "2026-08-24T09:00:00Z",
              },
            ],
          }),
      });

    const events = await cloudflareEmailProvider.checkBounces!(config, secret);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.email)).toEqual([
      "bounced1@example.com",
      "bounced2@example.com",
    ]);
  });

  it("stops paginating once entries are at or before `since`, without fetching further pages", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          page: 1,
          per_page: 1,
          total: 2,
          result: [
            {
              email: "new@example.com",
              reason: "hard_bounce",
              created_at: "2026-08-24T10:00:00Z",
            },
          ],
        }),
    });

    const events = await cloudflareEmailProvider.checkBounces!(
      config,
      secret,
      new Date("2026-08-24T10:00:00Z"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });

  it("only returns entries newer than `since`", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          page: 1,
          per_page: 2,
          total: 2,
          result: [
            {
              email: "new@example.com",
              reason: "hard_bounce",
              created_at: "2026-08-24T11:00:00Z",
            },
            {
              email: "old@example.com",
              reason: "hard_bounce",
              created_at: "2026-08-24T09:00:00Z",
            },
          ],
        }),
    });

    const events = await cloudflareEmailProvider.checkBounces!(
      config,
      secret,
      new Date("2026-08-24T10:00:00Z"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.email)).toEqual(["new@example.com"]);
  });

  it("aborts if the API reports a total that pagination never reaches", async () => {
    fetchMock.mockImplementation((url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            page,
            per_page: 1,
            total: Number.MAX_SAFE_INTEGER,
            result: [
              {
                email: `bounced${page}@example.com`,
                reason: "hard_bounce",
                created_at: "2026-08-24T10:00:00Z",
              },
            ],
          }),
      });
    });

    await expect(
      cloudflareEmailProvider.checkBounces!(config, secret),
    ).rejects.toThrow("exceeded");
  });

  it("throws when the suppression list request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null),
    });

    await expect(
      cloudflareEmailProvider.checkBounces!(config, secret),
    ).rejects.toThrow("Cloudflare Email suppression list fetch failed");
  });
});
