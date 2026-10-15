import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postmarkProvider } from "../postmark.provider.js";

const config = { fromEmail: "hello@acme.com", fromName: "Acme" };
const secret = { serverToken: "server-token" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function webhook(body: unknown) {
  return postmarkProvider.parseWebhook?.({
    rawBody: Buffer.from(JSON.stringify(body)),
    headers: {},
    secret,
  });
}

describe("send", () => {
  it("POSTs the email with the server token and returns Postmark's MessageID", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ ErrorCode: 0, Message: "OK", MessageID: "msg-1" }),
    });

    const result = await postmarkProvider.send(config, secret, {
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      replyTo: "support@acme.com",
      headers: { "List-Unsubscribe": "<https://example.com/u>" },
    });

    expect(result).toEqual({ providerMessageId: "msg-1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(init.headers).toMatchObject({
      "X-Postmark-Server-Token": "server-token",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      From: "Acme <hello@acme.com>",
      To: "alice@example.com",
      Subject: "Hi",
      HtmlBody: "<p>Hi</p>",
      TextBody: "Hi",
      MessageStream: "outbound",
      ReplyTo: "support@acme.com",
      Headers: [{ Name: "List-Unsubscribe", Value: "<https://example.com/u>" }],
    });
  });

  it("sends through the configured message stream", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ErrorCode: 0, MessageID: "msg-1" }),
    });
    await postmarkProvider.send(
      { ...config, messageStream: "broadcast" },
      secret,
      { to: "a@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" },
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      MessageStream: "broadcast",
    });
  });

  it("throws Postmark's message when it rejects the email", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          ErrorCode: 400,
          Message:
            "The 'From' address you supplied (hello@acme.com) is not a Sender Signature on your account.",
        }),
    });
    await expect(
      postmarkProvider.send(config, secret, {
        to: "a@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      }),
    ).rejects.toThrow("is not a Sender Signature");
  });
});

describe("verify", () => {
  it("rejects a bad server token", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          ErrorCode: 10,
          Message:
            "The Server Token you provided in the X-Postmark-Server-Token request header was invalid.",
        }),
    });
    await expect(postmarkProvider.verify?.(config, secret)).rejects.toThrow(
      "Postmark server token didn't work",
    );
  });
});

describe("webhooks", () => {
  const bounce = {
    RecordType: "Bounce",
    MessageID: "msg-1",
    Type: "HardBounce",
    Description: "The server was unable to deliver your message.",
    Details: "smtp;550 5.1.1 unknown user",
    Inactive: true,
    BouncedAt: "2026-10-15T10:00:00Z",
  };

  it("treats bounces Postmark deactivated the address for as hard", () => {
    expect(webhook(bounce)).toEqual([
      {
        providerMessageId: "msg-1",
        bounceType: "hard",
        reason: "smtp;550 5.1.1 unknown user",
        occurredAt: new Date("2026-10-15T10:00:00Z"),
      },
    ]);
  });

  it("treats other bounces as soft", () => {
    expect(
      webhook({ ...bounce, Type: "SoftBounce", Inactive: false })?.[0]
        ?.bounceType,
    ).toBe("soft");
  });

  it("opts people out who mark the email as spam", () => {
    expect(
      webhook({ RecordType: "SpamComplaint", MessageID: "msg-1" }),
    ).toEqual([
      expect.objectContaining({ bounceType: "hard", reason: "Marked as spam" }),
    ]);
  });

  it("ignores other events", () => {
    expect(webhook({ RecordType: "Delivery", MessageID: "msg-1" })).toEqual([]);
  });
});
