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
const invoicesRetrieve = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createStripeClientForKey).mockReturnValue({
    webhooks: { constructEvent },
    customers: { retrieve },
    invoices: { retrieve: invoicesRetrieve },
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

  it("a trial that ends without a payment method has expired", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "paused" },
          { status: "trialing" },
        ),
      ),
    ).toEqual(["trial_expired"]);
  });

  it("a trial whose first charge fails is a trial payment failure; Stripe retries it", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "past_due" },
          { status: "trialing" },
        ),
      ),
    ).toEqual(["trial_payment_failed"]);
  });

  it("a trial whose first charge fails with no retries left has expired", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "unpaid" },
          { status: "trialing" },
        ),
      ),
    ).toEqual(["trial_expired"]);
  });

  it.each(["past_due", "unpaid"])(
    "a paid subscription going %s is a payment failure",
    (status) => {
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { status },
            { status: "active" },
          ),
        ),
      ).toEqual(["payment_failed"]);
    },
  );

  it("retries don't change the status, so a failure is reported once", () => {
    expect(
      matchStripeEvent(
        event(
          "customer.subscription.updated",
          { status: "past_due" },
          { latest_invoice: "in_2" },
        ),
      ),
    ).toEqual([]);
  });

  describe("after a trial's first charge fails", () => {
    const firstPeriod = {
      trial_end: 2_000,
      items: { data: [{ current_period_start: 2_000 }] },
    };

    it("converts when a retry succeeds", () => {
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { ...firstPeriod, status: "active" },
            { status: "past_due" },
          ),
        ),
      ).toEqual(["trial_converted"]);
    });

    it("reads the period from the subscription on older API versions", () => {
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { trial_end: 2_000, current_period_start: 2_000, status: "active" },
            { status: "past_due" },
          ),
        ),
      ).toEqual(["trial_converted"]);
    });

    it("expires when the retries run out", () => {
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { ...firstPeriod, status: "unpaid" },
            { status: "past_due" },
          ),
        ),
      ).toEqual(["trial_expired"]);
      expect(
        matchStripeEvent(
          event("customer.subscription.deleted", {
            ...firstPeriod,
            ended_at: 3_000,
            cancellation_details: { reason: "payment_failed" },
          }),
        ),
      ).toEqual(["trial_expired"]);
    });

    it("leaves later renewals alone", () => {
      const laterPeriod = {
        trial_end: 2_000,
        items: { data: [{ current_period_start: 9_000 }] },
      };
      expect(
        matchStripeEvent(
          event(
            "customer.subscription.updated",
            { ...laterPeriod, status: "active" },
            { status: "past_due" },
          ),
        ),
      ).toEqual([]);
      expect(
        matchStripeEvent(
          event("customer.subscription.deleted", {
            ...laterPeriod,
            ended_at: 9_500,
            cancellation_details: { reason: "payment_failed" },
          }),
        ),
      ).toEqual(["subscription_canceled"]);
    });
  });

  it("cancelling in the first period after a trial is a cancellation, not an expiry", () => {
    expect(
      matchStripeEvent(
        event("customer.subscription.deleted", {
          trial_end: 2_000,
          items: { data: [{ current_period_start: 2_000 }] },
          ended_at: 2_500,
          cancellation_details: { reason: "cancellation_requested" },
        }),
      ),
    ).toEqual(["subscription_canceled"]);
  });

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

  it("invoice and other events match nothing; payment failures come from the subscription", () => {
    expect(
      matchStripeEvent(event("invoice.payment_failed", { attempt_count: 1 })),
    ).toEqual([]);
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

describe("enrich", () => {
  const secret = { apiKey: "rk_1" };
  const failed = (latest_invoice: unknown) =>
    event(
      "customer.subscription.updated",
      { status: "past_due", latest_invoice },
      { status: "trialing" },
    );

  it("adds the latest invoice's payment link and amount for payment failures", async () => {
    invoicesRetrieve.mockResolvedValue({
      hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
      amount_due: 1500,
      currency: "gbp",
    });

    await expect(
      stripeSource.enrich!(failed("in_1"), ["trial_payment_failed"], secret),
    ).resolves.toEqual({
      invoiceUrl: "https://invoice.stripe.com/i/in_1",
      amountDue: 1500,
      currency: "gbp",
    });
    expect(createStripeClientForKey).toHaveBeenCalledWith("rk_1");
    expect(invoicesRetrieve).toHaveBeenCalledWith("in_1");
  });

  it("uses an expanded invoice without calling Stripe", async () => {
    await expect(
      stripeSource.enrich!(
        failed({
          hosted_invoice_url: "https://x",
          amount_due: 10,
          currency: "usd",
        }),
        ["payment_failed"],
        secret,
      ),
    ).resolves.toEqual({
      invoiceUrl: "https://x",
      amountDue: 10,
      currency: "usd",
    });
    expect(invoicesRetrieve).not.toHaveBeenCalled();
  });

  it("doesn't call Stripe for other events", async () => {
    await expect(
      stripeSource.enrich!(failed("in_1"), ["trial_converted"], secret),
    ).resolves.toEqual({});
    expect(invoicesRetrieve).not.toHaveBeenCalled();
  });

  it("skips a missing invoice but lets other errors through so the job retries", async () => {
    invoicesRetrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such invoice"), { code: "resource_missing" }),
    );
    await expect(
      stripeSource.enrich!(failed("in_gone"), ["payment_failed"], secret),
    ).resolves.toEqual({});

    invoicesRetrieve.mockRejectedValueOnce(new Error("Stripe is down"));
    await expect(
      stripeSource.enrich!(failed("in_1"), ["payment_failed"], secret),
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
