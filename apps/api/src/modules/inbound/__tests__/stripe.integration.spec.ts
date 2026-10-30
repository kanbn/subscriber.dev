import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStripeClientForKey } from "@subscriber.dev/stripe";

import { isTriggerEvent } from "../inboundSource.js";
import { stripeIntegration } from "../sources/stripe/stripe.integration.js";
import { stripeSource } from "../sources/stripe/stripe.source.js";

vi.mock("@subscriber.dev/stripe", () => ({
  createStripeClientForKey: vi.fn(),
  STRIPE_API_VERSION: "2026-09-30.endive",
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

describe("connect", () => {
  const webhookEndpoints = {
    list: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
  };
  const url = "https://api.example.com/webhooks/stripe/tok";

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.mocked(createStripeClientForKey).mockReturnValue({
      webhookEndpoints,
    } as any);
    webhookEndpoints.list.mockResolvedValue({ data: [] });
    webhookEndpoints.create.mockResolvedValue({
      id: "we_new",
      secret: "whsec_new",
    });
    return () => vi.unstubAllEnvs();
  });

  it("creates the webhook endpoint and saves its signing secret", async () => {
    const result = await stripeIntegration.connect!(
      { webhookToken: "tok" },
      { apiKey: "rk_1" },
    );

    expect(webhookEndpoints.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url,
        enabled_events: [...stripeSource.eventsToEnable],
        api_version: "2026-09-30.endive",
      }),
    );
    expect(result).toEqual({
      config: {
        webhookToken: "tok",
        webhookEndpointId: "we_new",
        webhookStatus: "automatic",
      },
      secret: { apiKey: "rk_1", webhookSecret: "whsec_new" },
    });
  });

  it("replaces endpoints already pointing at the webhook URL", async () => {
    webhookEndpoints.list.mockResolvedValue({
      data: [
        { id: "we_old", url },
        { id: "we_other", url: "https://elsewhere.example.com" },
      ],
    });

    await stripeIntegration.connect!(
      { webhookToken: "tok" },
      { apiKey: "rk_1" },
    );

    expect(webhookEndpoints.del).toHaveBeenCalledWith("we_old");
    expect(webhookEndpoints.del).not.toHaveBeenCalledWith("we_other");
  });

  it("updates the endpoint it created before, keeping events added in Stripe and the stored secret", async () => {
    webhookEndpoints.retrieve.mockResolvedValue({
      id: "we_1",
      enabled_events: [
        "customer.subscription.created",
        "checkout.session.completed",
      ],
    });
    webhookEndpoints.update.mockResolvedValue({ id: "we_1" });

    const result = await stripeIntegration.connect!(
      { webhookToken: "tok", webhookEndpointId: "we_1" },
      { apiKey: "rk_1", webhookSecret: "whsec_stored" },
    );

    expect(webhookEndpoints.update).toHaveBeenCalledWith("we_1", {
      url,
      enabled_events: [
        "customer.subscription.created",
        "checkout.session.completed",
        ...stripeSource.eventsToEnable.filter(
          (event) => event !== "customer.subscription.created",
        ),
      ],
    });
    expect(webhookEndpoints.create).not.toHaveBeenCalled();
    expect(result.secret.webhookSecret).toBe("whsec_stored");
  });

  it("leaves an endpoint that sends every event as it is", async () => {
    webhookEndpoints.retrieve.mockResolvedValue({
      id: "we_1",
      enabled_events: ["*"],
    });
    webhookEndpoints.update.mockResolvedValue({ id: "we_1" });

    await stripeIntegration.connect!(
      { webhookToken: "tok", webhookEndpointId: "we_1" },
      { apiKey: "rk_1", webhookSecret: "whsec_stored" },
    );

    expect(webhookEndpoints.update).toHaveBeenCalledWith("we_1", {
      url,
      enabled_events: ["*"],
    });
  });

  it("creates a new endpoint when the old one is gone, such as after switching Stripe accounts", async () => {
    webhookEndpoints.retrieve.mockRejectedValue({ code: "resource_missing" });

    const result = await stripeIntegration.connect!(
      { webhookToken: "tok", webhookEndpointId: "we_gone" },
      { apiKey: "rk_2", webhookSecret: "whsec_old" },
    );

    expect(result.config.webhookEndpointId).toBe("we_new");
    expect(result.secret.webhookSecret).toBe("whsec_new");
  });

  it("leaves a webhook added by hand alone", async () => {
    const result = await stripeIntegration.connect!(
      { webhookToken: "tok" },
      { apiKey: "rk_1", webhookSecret: "whsec_manual" },
    );

    expect(createStripeClientForKey).not.toHaveBeenCalled();
    expect(result.config.webhookStatus).toBe("manual");
    expect(result.secret.webhookSecret).toBe("whsec_manual");
  });

  it("still saves when the key can't manage webhook endpoints", async () => {
    webhookEndpoints.list.mockRejectedValue(
      Object.assign(new Error("permission denied"), { statusCode: 403 }),
    );

    const result = await stripeIntegration.connect!(
      { webhookToken: "tok" },
      { apiKey: "rk_read_only" },
    );

    expect(result).toEqual({
      config: { webhookToken: "tok" },
      secret: { apiKey: "rk_read_only" },
    });
    expect(stripeIntegration.describe!(result.config).nextStep).toContain(
      "Webhook Endpoints: Write",
    );
  });
});

describe("connect failures", () => {
  it("explains any other reason Stripe refused the webhook", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.mocked(createStripeClientForKey).mockReturnValue({
      webhookEndpoints: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi
          .fn()
          .mockRejectedValue(
            new Error("You have reached the maximum of 16 webhook endpoints"),
          ),
      },
    } as any);

    await expect(
      stripeIntegration.connect!({ webhookToken: "tok" }, { apiKey: "rk_1" }),
    ).rejects.toThrow(
      "Couldn't create the Stripe webhook: You have reached the maximum of 16 webhook endpoints",
    );
    vi.unstubAllEnvs();
  });
});

describe("prepareConfig", () => {
  it("keeps the endpoint subscriber.dev created, ignoring anything sent", () => {
    expect(
      stripeIntegration.prepareConfig!(
        { webhookEndpointId: "we_forged" } as any,
        {
          webhookToken: "tok",
          webhookEndpointId: "we_1",
          webhookStatus: "automatic",
        },
      ),
    ).toEqual({
      webhookToken: "tok",
      webhookEndpointId: "we_1",
      webhookStatus: "automatic",
    });
  });
});

describe("disconnect", () => {
  it("deletes the endpoint subscriber.dev created", async () => {
    const del = vi.fn();
    vi.mocked(createStripeClientForKey).mockReturnValue({
      webhookEndpoints: { del },
    } as any);

    await stripeIntegration.disconnect!(
      { webhookEndpointId: "we_1" },
      { apiKey: "rk_1" },
    );
    await stripeIntegration.disconnect!({}, { apiKey: "rk_1" });

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("we_1");
  });
});
