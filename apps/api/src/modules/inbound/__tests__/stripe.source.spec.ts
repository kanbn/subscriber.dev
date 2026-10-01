import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStripeClientForKey } from "@subscriber.dev/stripe";

import { InvalidWebhookError } from "../inboundSource.js";
import {
  matchStripeEvent,
  stripeSource,
} from "../sources/stripe/stripe.source.js";

vi.mock("@subscriber.dev/stripe", () => ({
  createStripeClientForKey: vi.fn(),
}));

const constructEvent = vi.fn();
const retrieve = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createStripeClientForKey).mockReturnValue({
    webhooks: { constructEvent },
    customers: { retrieve },
  } as any);
});

function event(
  type: string,
  object: Record<string, unknown>,
  previous_attributes?: Record<string, unknown>,
) {
  return {
    externalEventId: "evt_1",
    type,
    payload: { data: { object, previous_attributes } },
  };
}

describe("matchStripeEvent", () => {
  it.each([
    ["trialing", ["trial_started"]],
    ["active", ["subscription_started"]],
    ["incomplete", []],
  ])("a subscription created %s matches %j", (status, expected) => {
    expect(
      matchStripeEvent(event("customer.subscription.created", { status })),
    ).toEqual(expected);
  });

  it("trial_will_end is a trial ending", () => {
    expect(
      matchStripeEvent(event("customer.subscription.trial_will_end", {})),
    ).toEqual(["trial_ending"]);
  });

  it("moving from trialing to active is a conversion", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "active" },
          { status: "trialing" },
        ),
      ),
    ).toEqual(["trial_converted"]);
  });

  it.each(["paused", "past_due", "unpaid", "incomplete_expired"])(
    "moving from trialing to %s is an expired trial",
    (status) => {
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { status },
            { status: "trialing" },
          ),
        ),
      ).toEqual(["trial_expired"]);
    },
  );

  it("a subscription that becomes active once its first payment is confirmed has started", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "active" },
          { status: "incomplete" },
        ),
      ),
    ).toEqual(["subscription_started"]);
  });

  it("ignores updates that don't leave a trial", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "active" },
          { items: {} },
        ),
      ),
    ).toEqual([]);
  });

  it("a deletion during the trial is an expired trial, otherwise a cancellation", () => {
    expect(
      matchStripeEvent(
        event("customer.subscription.deleted", {
          trial_end: 2_000,
          ended_at: 1_500,
        }),
      ),
    ).toEqual(["trial_expired"]);
    expect(
      matchStripeEvent(
        event("customer.subscription.deleted", {
          trial_end: null,
          ended_at: 5_000,
        }),
      ),
    ).toEqual(["subscription_canceled"]);
  });

  it("a failed invoice payment is a payment failure; others match nothing", () => {
    expect(matchStripeEvent(event("invoice.payment_failed", {}))).toEqual([
      "payment_failed",
    ]);
    expect(matchStripeEvent(event("checkout.session.completed", {}))).toEqual(
      [],
    );
  });
});

describe("personRef", () => {
  it("reads a customer ID or an expanded customer", () => {
    expect(stripeSource.personRef(event("x", { customer: "cus_1" }))).toBe(
      "cus_1",
    );
    expect(
      stripeSource.personRef(event("x", { customer: { id: "cus_2" } })),
    ).toBe("cus_2");
    expect(stripeSource.personRef(event("x", {}))).toBeUndefined();
  });
});

describe("verifyWebhook", () => {
  const rawBody = Buffer.from("{}");

  it("needs a signing secret and a signature", () => {
    expect(() =>
      stripeSource.verifyWebhook({
        rawBody,
        headers: { "stripe-signature": "sig" },
        secret: { apiKey: "rk" },
      }),
    ).toThrow(InvalidWebhookError);
    expect(() =>
      stripeSource.verifyWebhook({
        rawBody,
        headers: {},
        secret: { apiKey: "rk", webhookSecret: "whsec_1" },
      }),
    ).toThrow("Missing Stripe-Signature header");
  });

  it("rejects a bad signature", () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });
    expect(() =>
      stripeSource.verifyWebhook({
        rawBody,
        headers: { "stripe-signature": "bad" },
        secret: { apiKey: "rk", webhookSecret: "whsec_1" },
      }),
    ).toThrow("Invalid Stripe signature");
  });

  it("verifies against the raw body and returns the event", () => {
    constructEvent.mockReturnValue({ id: "evt_9", type: "invoice.paid" });

    const result = stripeSource.verifyWebhook({
      rawBody,
      headers: { "stripe-signature": "sig" },
      secret: { apiKey: "rk", webhookSecret: "whsec_1" },
    });

    expect(constructEvent).toHaveBeenCalledWith(rawBody, "sig", "whsec_1");
    expect(result).toEqual({
      externalEventId: "evt_9",
      type: "invoice.paid",
      payload: { id: "evt_9", type: "invoice.paid" },
    });
  });
});

describe("fetchPerson", () => {
  it("returns the customer's email, name and subscriberExternalId", async () => {
    retrieve.mockResolvedValue({
      email: "a@example.com",
      name: "A",
      metadata: { subscriberExternalId: "user_1" },
    });

    await expect(
      stripeSource.fetchPerson("cus_1", { apiKey: "rk" }),
    ).resolves.toEqual({
      person: {
        email: "a@example.com",
        name: "A",
        subscriberExternalId: "user_1",
      },
    });
  });

  it("skips customers that don't exist (e.g. test events) or were deleted", async () => {
    retrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such customer"), {
        code: "resource_missing",
      }),
    );
    await expect(
      stripeSource.fetchPerson("cus_1", { apiKey: "rk" }),
    ).resolves.toEqual({
      skipReason: "Customer cus_1 doesn't exist in Stripe",
    });

    retrieve.mockResolvedValueOnce({ deleted: true });
    await expect(
      stripeSource.fetchPerson("cus_1", { apiKey: "rk" }),
    ).resolves.toEqual({ skipReason: "Customer cus_1 was deleted in Stripe" });
  });

  it("lets other errors through so the job retries", async () => {
    retrieve.mockRejectedValue(new Error("Stripe is down"));
    await expect(
      stripeSource.fetchPerson("cus_1", { apiKey: "rk" }),
    ).rejects.toThrow("Stripe is down");
  });
});

describe("templateData", () => {
  it("adds friendly fields to the Stripe object", () => {
    const data = stripeSource.templateData(
      event("customer.subscription.created", {
        status: "trialing",
        trial_end: 1_800_000_000,
        items: { data: [{ price: { nickname: "Team" } }] },
      }),
      ["trial_started"],
    );
    expect(data).toEqual(
      expect.objectContaining({
        status: "trialing",
        eventType: "customer.subscription.created",
        lifecycleEvent: "trial_started",
        planName: "Team",
        trialEndsAt: new Date(1_800_000_000_000).toISOString(),
      }),
    );
  });
});
