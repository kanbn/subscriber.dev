import { createStripeClientForKey } from "@subscriber.dev/stripe";

import type {
  FetchedPerson,
  InboundEvent,
  InboundSource,
} from "../../inboundSource.js";
import { InvalidWebhookError } from "../../inboundSource.js";

export const STRIPE_EVENTS = [
  { name: "trial_started", label: "Trial started" },
  { name: "trial_ending", label: "Trial ending (3 days before)" },
  { name: "trial_converted", label: "Trial converted to paid" },
  {
    name: "trial_payment_failed",
    label: "Trial ended, payment failed (Stripe retries it)",
  },
  { name: "trial_expired", label: "Trial expired unpaid" },
  { name: "subscription_started", label: "Subscription started (paid)" },
  { name: "subscription_canceled", label: "Subscription canceled" },
  { name: "payment_failed", label: "Renewal payment failed" },
] as const;

export const STRIPE_EVENTS_TO_ENABLE = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
] as const;

const PAYMENT_FAILED_EVENTS = ["trial_payment_failed", "payment_failed"];

export interface StripeSecret {
  apiKey: string;
  webhookSecret?: string;
}

// While Stripe retries a failed charge the subscription is past_due (or
// unpaid, depending on the account's retry settings).
const PAYMENT_RETRYING = new Set(["past_due", "unpaid"]);

function objectOf(event: InboundEvent) {
  const data = event.payload.data as
    | {
        object?: Record<string, unknown>;
        previous_attributes?: Record<string, unknown>;
      }
    | undefined;
  return {
    object: data?.object ?? {},
    previous: data?.previous_attributes,
  };
}

export function matchStripeEvent(event: InboundEvent): string[] {
  const { object, previous } = objectOf(event);
  const status = object.status;

  switch (event.type) {
    case "customer.subscription.created":
      if (status === "trialing") return ["trial_started"];
      if (status === "active") return ["subscription_started"];
      return [];

    case "customer.subscription.trial_will_end":
      return ["trial_ending"];

    case "customer.subscription.updated": {
      const was = previous?.status;
      // Subscriptions that need a payment confirmed first start "incomplete".
      if (was === "incomplete" && status === "active") {
        return ["subscription_started"];
      }
      if (was === "trialing") {
        if (status === "active") return ["trial_converted"];
        // The first charge failed; Stripe retries it.
        if (status === "past_due") return ["trial_payment_failed"];
        // Ended without a payment method, or failed with no retries left.
        if (status === "paused" || status === "unpaid") {
          return ["trial_expired"];
        }
        return [];
      }
      if (
        was === "active" &&
        typeof status === "string" &&
        PAYMENT_RETRYING.has(status)
      ) {
        return ["payment_failed"];
      }
      if (
        typeof was === "string" &&
        PAYMENT_RETRYING.has(was) &&
        inFirstPeriodAfterTrial(object)
      ) {
        if (status === "active") return ["trial_converted"];
        if (status === "unpaid") return ["trial_expired"];
      }
      return [];
    }

    case "customer.subscription.deleted": {
      const details = object.cancellation_details as
        | { reason?: string | null }
        | undefined;
      const unpaidAfterTrial =
        details?.reason === "payment_failed" && inFirstPeriodAfterTrial(object);
      return [
        endedDuringTrial(object) || unpaidAfterTrial
          ? "trial_expired"
          : "subscription_canceled",
      ];
    }

    default:
      return [];
  }
}

function inFirstPeriodAfterTrial(
  subscription: Record<string, unknown>,
): boolean {
  const items = subscription.items as
    | { data?: { current_period_start?: unknown }[] }
    | undefined;
  const periodStart =
    items?.data?.[0]?.current_period_start ?? subscription.current_period_start;
  return (
    typeof subscription.trial_end === "number" &&
    periodStart === subscription.trial_end
  );
}

function endedDuringTrial(subscription: Record<string, unknown>): boolean {
  const trialEnd = subscription.trial_end;
  const endedAt = subscription.ended_at;
  return (
    typeof trialEnd === "number" &&
    typeof endedAt === "number" &&
    endedAt <= trialEnd
  );
}

function isResourceMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "resource_missing"
  );
}

export const stripeSource: InboundSource<StripeSecret> = {
  source: "stripe",
  name: "Stripe",
  events: STRIPE_EVENTS,
  eventsToEnable: STRIPE_EVENTS_TO_ENABLE,

  verifyWebhook({ rawBody, headers, secret }) {
    if (!secret.webhookSecret) {
      throw new InvalidWebhookError(
        "This Stripe integration has no webhook signing secret yet",
      );
    }
    const signature = headers["stripe-signature"];
    if (typeof signature !== "string") {
      throw new InvalidWebhookError("Missing Stripe-Signature header");
    }
    let event;
    try {
      event = createStripeClientForKey(secret.apiKey).webhooks.constructEvent(
        rawBody,
        signature,
        secret.webhookSecret,
      );
    } catch {
      throw new InvalidWebhookError("Invalid Stripe signature");
    }
    return {
      externalEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    };
  },

  match: matchStripeEvent,

  personRef(event) {
    const customer = objectOf(event).object.customer;
    if (typeof customer === "string") return customer;
    if (
      typeof customer === "object" &&
      customer !== null &&
      "id" in customer &&
      typeof customer.id === "string"
    ) {
      return customer.id;
    }
    return undefined;
  },

  async fetchPerson(customerId, secret): Promise<FetchedPerson> {
    let customer;
    try {
      customer = await createStripeClientForKey(
        secret.apiKey,
      ).customers.retrieve(customerId);
    } catch (error) {
      if (isResourceMissing(error)) {
        return { skipReason: `Customer ${customerId} doesn't exist in Stripe` };
      }
      throw error;
    }
    if (customer.deleted) {
      return { skipReason: `Customer ${customerId} was deleted in Stripe` };
    }
    return {
      person: {
        email: customer.email ?? undefined,
        name: customer.name ?? undefined,
        subscriberExternalId:
          customer.metadata?.subscriberExternalId || undefined,
      },
    };
  },

  async enrich(event, matched, secret) {
    if (!matched.some((name) => PAYMENT_FAILED_EVENTS.includes(name))) {
      return {};
    }
    const latest = objectOf(event).object.latest_invoice;
    let invoice: Record<string, unknown> | null = null;
    if (typeof latest === "string") {
      try {
        invoice = (await createStripeClientForKey(
          secret.apiKey,
        ).invoices.retrieve(latest)) as unknown as Record<string, unknown>;
      } catch (error) {
        if (!isResourceMissing(error)) throw error;
      }
    } else if (typeof latest === "object" && latest !== null) {
      invoice = latest as Record<string, unknown>;
    }
    if (!invoice) return {};
    return {
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      amountDue: invoice.amount_due ?? null,
      currency: invoice.currency ?? null,
    };
  },

  templateData(event, matched) {
    const { object } = objectOf(event);
    const items = object.items as
      | { data?: { price?: { nickname?: string | null } }[] }
      | undefined;
    return {
      ...object,
      eventType: event.type,
      lifecycleEvent: matched[0] ?? null,
      planName: items?.data?.[0]?.price?.nickname ?? null,
      trialEndsAt:
        typeof object.trial_end === "number"
          ? new Date(object.trial_end * 1000).toISOString()
          : null,
    };
  },
};
