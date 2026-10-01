import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStripeClientForKey } from "@subscriber.dev/stripe";

import { isTriggerEvent } from "../inboundSource.js";
import { stripeIntegration } from "../sources/stripe/stripe.integration.js";
import { stripeSource } from "../sources/stripe/stripe.source.js";

vi.mock("@subscriber.dev/stripe", () => ({
  createStripeClientForKey: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trigger events", () => {
  it("accepts Stripe's named events and raw event types, rejecting unknown names", () => {
    expect(isTriggerEvent(stripeSource, "trial_started")).toBe(true);
    expect(isTriggerEvent(stripeSource, "checkout.session.completed")).toBe(
      true,
    );
    expect(isTriggerEvent(stripeSource, "trial_begun")).toBe(false);
    expect(isTriggerEvent(stripeSource, "Checkout Completed")).toBe(false);
  });
});

describe("config", () => {
  it("requires an API key but lets the webhook secret come later", () => {
    expect(stripeIntegration.secretSchema.safeParse({}).success).toBe(false);
    expect(
      stripeIntegration.secretSchema.safeParse({ apiKey: "rk" }).success,
    ).toBe(true);
    expect(
      stripeIntegration.secretSchema.safeParse({
        apiKey: "rk",
        webhookSecret: "not-a-secret",
      }).success,
    ).toBe(false);
  });
});

describe("webhook token", () => {
  it("is generated for a new integration, ignoring any sent", () => {
    const config = stripeIntegration.prepareConfig!(
      { webhookToken: "attacker-chosen" },
      undefined,
    );
    expect(config.webhookToken).not.toBe("attacker-chosen");
    expect(config.webhookToken!.length).toBeGreaterThanOrEqual(32);
  });

  it("is kept when the integration is updated", () => {
    expect(
      stripeIntegration.prepareConfig!({}, { webhookToken: "existing-token" })
        .webhookToken,
    ).toBe("existing-token");
  });
});

describe("describe", () => {
  it("gives the webhook URL and the Stripe events to enable", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    const fields = stripeIntegration.describe!({ webhookToken: "tok" });
    vi.unstubAllEnvs();

    expect(fields.webhookUrl).toBe(
      "https://api.example.com/webhooks/stripe/tok",
    );
    expect(fields.eventsToEnable).toContain("customer.subscription.created");
  });
});

describe("verify", () => {
  it("rejects a key that can't read customers", async () => {
    vi.mocked(createStripeClientForKey).mockReturnValue({
      customers: {
        list: vi.fn().mockRejectedValue(new Error("permission denied")),
      },
    } as any);

    await expect(
      stripeIntegration.verify!({}, { apiKey: "rk_bad" }),
    ).rejects.toThrow("can't read customers: permission denied");
  });
});
