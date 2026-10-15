import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidWebhookError } from "../../../inbound/inboundSource.js";
import { resendProvider, verifyResendSignature } from "../resend.provider.js";

const config = {
  fromEmail: "hello@mail.acme.com",
  fromName: "Acme",
};

const webhookKey = Buffer.from("resend-test-signing-key");
const webhookSecret = `whsec_${webhookKey.toString("base64")}`;
const secret = { apiKey: "re_test", webhookSecret };

function signed(body: unknown, at = new Date()) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = String(Math.floor(at.getTime() / 1000));
  const signature = createHmac("sha256", webhookKey)
    .update(`msg_1.${timestamp}.${rawBody.toString()}`)
    .digest("base64");
  return {
    rawBody,
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": timestamp,
      "svix-signature": `v1,bm90IGl0 v1,${signature}`,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("send", () => {
  it("POSTs the email with the API key and returns Resend's id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-123" }),
    });

    const result = await resendProvider.send(config, secret, {
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      replyTo: "support@acme.com",
      headers: { "List-Unsubscribe": "<https://example.com/u>" },
    });

    expect(result).toEqual({ providerMessageId: "email-123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Acme <hello@mail.acme.com>",
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      reply_to: "support@acme.com",
      headers: { "List-Unsubscribe": "<https://example.com/u>" },
    });
  });

  it("throws Resend's error message when sending fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          name: "validation_error",
          message: "The mail.acme.com domain is not verified.",
        }),
    });

    await expect(
      resendProvider.send(config, secret, {
        to: "alice@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      }),
    ).rejects.toThrow(
      "Resend send failed: The mail.acme.com domain is not verified.",
    );
  });
});

describe("verify", () => {
  it("accepts a sending-only key", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ name: "restricted_api_key" }),
    });
    await expect(resendProvider.verify?.(config, secret)).resolves.toBe(
      undefined,
    );
  });

  it("rejects a full-access key when the from domain isn't verified", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ name: "mail.acme.com", status: "pending" }],
        }),
    });
    await expect(resendProvider.verify?.(config, secret)).rejects.toThrow(
      "mail.acme.com isn't verified in Resend yet",
    );
  });

  it("allows Resend's test sender, which isn't one of the account's domains", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    await expect(
      resendProvider.verify?.(
        { ...config, fromEmail: "onboarding@resend.dev" },
        secret,
      ),
    ).resolves.toBe(undefined);
  });

  it("rejects an invalid key", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          name: "validation_error",
          message: "API key is invalid",
        }),
    });
    await expect(resendProvider.verify?.(config, secret)).rejects.toThrow(
      "Resend API key didn't work: API key is invalid",
    );
  });
});

describe("webhooks", () => {
  const bounced = {
    type: "email.bounced",
    created_at: "2026-10-15T10:00:00.000Z",
    data: {
      email_id: "email-123",
      bounce: {
        type: "Permanent",
        subType: "General",
        message: "The recipient's mailbox does not exist.",
      },
    },
  };

  it("turns a permanent bounce into a hard bounce", () => {
    expect(
      resendProvider.parseWebhook?.({ ...signed(bounced), secret }),
    ).toEqual([
      {
        providerMessageId: "email-123",
        bounceType: "hard",
        reason: "The recipient's mailbox does not exist.",
        occurredAt: new Date("2026-10-15T10:00:00.000Z"),
      },
    ]);
  });

  it("treats transient bounces as soft", () => {
    const body = {
      ...bounced,
      data: {
        ...bounced.data,
        bounce: { type: "Transient", message: "Mailbox full" },
      },
    };
    expect(
      resendProvider.parseWebhook?.({ ...signed(body), secret })?.[0]
        ?.bounceType,
    ).toBe("soft");
  });

  it("opts people out who mark the email as spam", () => {
    const body = {
      type: "email.complained",
      created_at: "2026-10-15T10:00:00.000Z",
      data: { email_id: "email-123" },
    };
    expect(resendProvider.parseWebhook?.({ ...signed(body), secret })).toEqual([
      expect.objectContaining({ bounceType: "hard", reason: "Marked as spam" }),
    ]);
  });

  it("ignores other events", () => {
    const body = { ...bounced, type: "email.delivered" };
    expect(resendProvider.parseWebhook?.({ ...signed(body), secret })).toEqual(
      [],
    );
  });

  it("rejects a tampered body", () => {
    const request = signed(bounced);
    expect(() =>
      verifyResendSignature({
        ...request,
        rawBody: Buffer.from(JSON.stringify({ ...bounced, type: "x" })),
        secret: webhookSecret,
      }),
    ).toThrow(InvalidWebhookError);
  });

  it("rejects an old timestamp", () => {
    const request = signed(bounced, new Date("2026-10-15T10:00:00Z"));
    expect(() =>
      verifyResendSignature({
        ...request,
        secret: webhookSecret,
        now: new Date("2026-10-15T10:06:00Z"),
      }),
    ).toThrow("Webhook timestamp is too old or too new");
  });

  it("rejects webhooks before a signing secret is saved", () => {
    expect(() =>
      resendProvider.parseWebhook?.({
        ...signed(bounced),
        secret: { apiKey: "re_test" },
      }),
    ).toThrow("No webhook signing secret saved");
  });
});
