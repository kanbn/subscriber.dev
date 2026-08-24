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
