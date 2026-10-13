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
  it("POSTs to the sending endpoint with the bearer token, text part and headers", async () => {
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
      text: "Welcome Alice!",
      headers: {
        "List-Unsubscribe":
          "<https://api.example.com/unsubscribe/one-click?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
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
      headers: {
        "List-Unsubscribe":
          "<https://api.example.com/unsubscribe/one-click?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  });

  it("lets an email override the sender name and reply-to", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          errors: [],
          result: { message_id: "msg-1" },
        }),
    });

    await cloudflareEmailProvider.send(
      { ...config, replyTo: "support@kan.bn" },
      secret,
      {
        to: "alice@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
        fromName: "Jane from Kan",
        replyTo: "jane@kan.bn",
      },
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toEqual({
      address: "hello@mail.kan.bn",
      name: "Jane from Kan",
    });
    expect(body.reply_to).toBe("jane@kan.bn");
  });

  it("sends reply_to when replyTo is configured", async () => {
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
      { ...config, replyTo: "henry@kan.bn" },
      secret,
      { to: "alice@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" },
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.reply_to).toBe("henry@kan.bn");
  });

  it("omits headers when none are given", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          errors: [],
          result: { message_id: "msg-123" },
        }),
    });

    await cloudflareEmailProvider.send(config, secret, {
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).not.toHaveProperty("headers");
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
      { to: "alice@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" },
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
        text: "Hi",
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
  const configWithZone = { ...config, zoneId: "zone_abc" };

  it("returns null (not checked) without calling the API when no zoneId is configured", async () => {
    const events = await cloudflareEmailProvider.checkBounces!(config, secret);

    expect(events).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps deliveryFailed events to bounces, classifying hard vs soft from the embedded SMTP code", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            viewer: {
              zones: [
                {
                  emailSendingAdaptive: [
                    {
                      datetime: "2026-08-24T14:11:15Z",
                      status: "deliveryFailed",
                      errorCause: "mailbox_gmail_unknown",
                      errorDetail:
                        "Permanent Unknown error: permanent error (550): 5.1.1 no such user",
                      messageId: "<abc@mail.kan.bn>",
                    },
                    {
                      datetime: "2026-08-24T13:47:16Z",
                      status: "deliveryFailed",
                      errorCause: "greylisted_postgrey",
                      errorDetail:
                        "Temporary Unknown error: transient error (450): 4.2.0 greylisted",
                      messageId: "<def@mail.kan.bn>",
                    },
                    {
                      datetime: "2026-08-24T15:24:10Z",
                      status: "delivered",
                      errorCause: "",
                      errorDetail: "",
                      messageId: "<ghi@mail.kan.bn>",
                    },
                    {
                      datetime: "2026-08-24T15:22:08Z",
                      status: "rejected",
                      errorCause: "suppressed",
                      errorDetail: "recipient suppressed",
                      messageId: "",
                    },
                  ],
                },
              ],
            },
          },
          errors: null,
        }),
    });

    const events = await cloudflareEmailProvider.checkBounces!(
      configWithZone,
      secret,
    );

    expect(events).toEqual([
      {
        providerMessageId: "<abc@mail.kan.bn>",
        bounceType: "hard",
        reason:
          "Permanent Unknown error: permanent error (550): 5.1.1 no such user",
        occurredAt: new Date("2026-08-24T14:11:15Z"),
      },
      {
        providerMessageId: "<def@mail.kan.bn>",
        bounceType: "soft",
        reason:
          "Temporary Unknown error: transient error (450): 4.2.0 greylisted",
        occurredAt: new Date("2026-08-24T13:47:16Z"),
      },
    ]);
  });

  it("sends the zoneId, since cursor, and now as the GraphQL query variables", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { viewer: { zones: [{ emailSendingAdaptive: [] }] } },
          errors: null,
        }),
    });
    const since = new Date("2026-08-24T12:00:00Z");

    await cloudflareEmailProvider.checkBounces!(configWithZone, secret, since);

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/graphql");
    expect(options.headers.Authorization).toBe("Bearer test-token");
    const body = JSON.parse(options.body);
    expect(body.variables.zoneTag).toBe("zone_abc");
    expect(body.variables.start).toBe("2026-08-24T12:00:00.000Z");
  });

  it("throws with the GraphQL error message when the request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: null,
          errors: [{ message: "Invalid zone tag" }],
        }),
    });

    await expect(
      cloudflareEmailProvider.checkBounces!(configWithZone, secret),
    ).rejects.toThrow("Invalid zone tag");
  });
});
