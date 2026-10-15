import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidWebhookError } from "../../../inbound/inboundSource.js";
import {
  sesBounceEvents,
  sesProvider,
  snsStringToSign,
  verifySnsMessage,
} from "../ses.provider.js";

const config = {
  region: "eu-west-2",
  fromEmail: "hello@acme.com",
  fromName: "Acme",
};
const secret = { accessKeyId: "AKIATEST", secretAccessKey: "secret" };

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const certUrl =
  "https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-abc.pem";

function signed(message: Record<string, string>, version = "2") {
  const full = {
    ...message,
    SignatureVersion: version,
    SigningCertURL: certUrl,
  };
  const signature = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256")
    .update(snsStringToSign(full))
    .sign(privateKey, "base64");
  return { ...full, Signature: signature };
}

function notification(sesMessage: unknown) {
  return signed({
    Type: "Notification",
    MessageId: "sns-1",
    TopicArn: "arn:aws:sns:eu-west-2:123456789012:ses-bounces",
    Message: JSON.stringify(sesMessage),
    Timestamp: "2026-10-15T10:00:00.000Z",
  });
}

const bounce = {
  notificationType: "Bounce",
  mail: { messageId: "ses-msg-1" },
  bounce: {
    bounceType: "Permanent",
    bounceSubType: "General",
    timestamp: "2026-10-15T10:00:00.000Z",
    bouncedRecipients: [
      {
        emailAddress: "a@example.com",
        diagnosticCode: "smtp; 550 user unknown",
      },
    ],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("send", () => {
  it("signs a SendEmail request for the region and returns SES's MessageId", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ MessageId: "ses-msg-1" }), { status: 200 }),
    );

    const result = await sesProvider.send(
      { ...config, configurationSetName: "marketing" },
      secret,
      {
        to: "alice@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
        replyTo: "support@acme.com",
        headers: { "List-Unsubscribe": "<https://example.com/u>" },
      },
    );

    expect(result).toEqual({ providerMessageId: "ses-msg-1" });
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe(
      "https://email.eu-west-2.amazonaws.com/v2/email/outbound-emails",
    );
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/eu-west-2\/ses\/aws4_request/,
    );
    expect(await request.json()).toEqual({
      FromEmailAddress: "Acme <hello@acme.com>",
      Destination: { ToAddresses: ["alice@example.com"] },
      ReplyToAddresses: ["support@acme.com"],
      ConfigurationSetName: "marketing",
      Content: {
        Simple: {
          Subject: { Data: "Hi", Charset: "UTF-8" },
          Body: {
            Html: { Data: "<p>Hi</p>", Charset: "UTF-8" },
            Text: { Data: "Hi", Charset: "UTF-8" },
          },
          Headers: [
            { Name: "List-Unsubscribe", Value: "<https://example.com/u>" },
          ],
        },
      },
    });
  });

  it("throws SES's message when it rejects the email", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Email address is not verified." }),
        { status: 400 },
      ),
    );
    await expect(
      sesProvider.send(config, secret, {
        to: "a@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      }),
    ).rejects.toThrow("SES send failed: Email address is not verified.");
  });
});

describe("verify", () => {
  it("accepts a verified domain when the address itself isn't an identity", async () => {
    fetchMock.mockImplementation((request: Request) => {
      if (request.url.endsWith("/account"))
        return new Response(JSON.stringify({ SendingEnabled: true }));
      if (request.url.endsWith("/identities/hello%40acme.com"))
        return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ VerifiedForSendingStatus: true }));
    });
    await expect(sesProvider.verify?.(config, secret)).resolves.toBe(undefined);
  });

  it("rejects an unverified from address", async () => {
    fetchMock.mockImplementation((request: Request) =>
      request.url.endsWith("/account")
        ? new Response(JSON.stringify({ SendingEnabled: true }))
        : new Response(JSON.stringify({ VerifiedForSendingStatus: false })),
    );
    await expect(sesProvider.verify?.(config, secret)).rejects.toThrow(
      "Verify hello@acme.com or acme.com in SES (eu-west-2) first",
    );
  });

  it("rejects keys that can't use SES", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "The security token included in the request is invalid.",
        }),
        { status: 403 },
      ),
    );
    await expect(sesProvider.verify?.(config, secret)).rejects.toThrow(
      "AWS keys didn't work for SES",
    );
  });
});

describe("SNS signatures", () => {
  const fetchKey = () => Promise.resolve(publicPem);

  it.each(["1", "2"])("accepts signature version %s", async (version) => {
    const message = signed(
      {
        Type: "Notification",
        MessageId: "sns-1",
        TopicArn: "arn:aws:sns:eu-west-2:123456789012:t",
        Subject: "Amazon SES Email Event Notification",
        Message: "hello",
        Timestamp: "2026-10-15T10:00:00.000Z",
      },
      version,
    );
    await expect(verifySnsMessage(message, fetchKey)).resolves.toBe(undefined);
  });

  it("rejects a tampered message", async () => {
    const message = { ...notification(bounce), Message: "{}" };
    await expect(verifySnsMessage(message, fetchKey)).rejects.toThrow(
      InvalidWebhookError,
    );
  });

  it("won't fetch a certificate from outside AWS SNS", async () => {
    const message = {
      ...notification(bounce),
      SigningCertURL: "https://evil.example.com/cert.pem",
    };
    await expect(
      sesProvider.parseWebhook?.({
        rawBody: Buffer.from(JSON.stringify(message)),
        headers: {},
        secret,
      }),
    ).rejects.toThrow("SNS URL isn't on an AWS SNS host");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("webhooks", () => {
  it("records a permanent bounce as hard, once the signature checks out", async () => {
    fetchMock.mockResolvedValue(new Response(publicPem));
    await expect(
      sesProvider.parseWebhook?.({
        rawBody: Buffer.from(JSON.stringify(notification(bounce))),
        headers: {},
        secret,
      }),
    ).resolves.toEqual([
      {
        providerMessageId: "ses-msg-1",
        bounceType: "hard",
        reason: "smtp; 550 user unknown",
        occurredAt: new Date("2026-10-15T10:00:00.000Z"),
      },
    ]);
  });

  it("confirms the SNS subscription automatically", async () => {
    fetchMock.mockImplementation(
      (url: URL) =>
        new Response(url.pathname.endsWith(".pem") ? publicPem : "<ok/>"),
    );
    const confirmation = signed({
      Type: "SubscriptionConfirmation",
      MessageId: "sns-2",
      Token: "token",
      TopicArn: "arn:aws:sns:eu-west-2:123456789012:t",
      Message: "You have chosen to subscribe",
      SubscribeURL:
        "https://sns.eu-west-2.amazonaws.com/?Action=ConfirmSubscription&Token=token",
      Timestamp: "2026-10-15T10:00:00.000Z",
    });
    await expect(
      sesProvider.parseWebhook?.({
        rawBody: Buffer.from(JSON.stringify(confirmation)),
        headers: {},
        secret,
      }),
    ).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      "Action=ConfirmSubscription",
    );
  });

  it("treats transient and undetermined bounces as soft", () => {
    for (const bounceType of ["Transient", "Undetermined"]) {
      expect(
        sesBounceEvents({
          ...bounce,
          bounce: { ...bounce.bounce, bounceType },
        })[0]?.bounceType,
      ).toBe("soft");
    }
  });

  it("opts people out who complain, but not not-spam reports", () => {
    const complaint = {
      eventType: "Complaint",
      mail: { messageId: "ses-msg-1" },
      complaint: { timestamp: "2026-10-15T10:00:00.000Z" },
    };
    expect(sesBounceEvents(complaint)).toEqual([
      expect.objectContaining({ bounceType: "hard", reason: "Marked as spam" }),
    ]);
    expect(
      sesBounceEvents({
        ...complaint,
        complaint: {
          ...complaint.complaint,
          complaintFeedbackType: "not-spam",
        },
      }),
    ).toEqual([]);
  });

  it("ignores deliveries", () => {
    expect(
      sesBounceEvents({
        notificationType: "Delivery",
        mail: { messageId: "x" },
      }),
    ).toEqual([]);
  });
});
