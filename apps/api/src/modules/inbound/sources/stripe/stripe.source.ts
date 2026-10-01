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
  { name: "trial_expired", label: "Trial expired unpaid" },
  { name: "subscription_started", label: "Subscription started (paid)" },
  { name: "subscription_canceled", label: "Subscription canceled" },
  { name: "payment_failed", label: "Payment failed" },
] as const;

export const STRIPE_EVENTS_TO_ENABLE = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_failed",
] as const;

export interface StripeSecret {
  apiKey: string;
  webhookSecret?: string;
}

const TRIAL_ENDED_UNPAID = new Set([
  "paused",
  "past_due",
  "unpaid",
  "incomplete_expired",
]);

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
      // Subscriptions that need a payment confirmed first start "incomplete".
      if (previous?.status === "incomplete" && status === "active") {
        return ["subscription_started"];
      }
      if (previous?.status !== "trialing") return [];
      if (status === "active") return ["trial_converted"];
      if (typeof status === "string" && TRIAL_ENDED_UNPAID.has(status)) {
        return ["trial_expired"];
      }
      return [];
    }

    case "customer.subscription.deleted":
      return [
        endedDuringTrial(object) ? "trial_expired" : "subscription_canceled",
      ];

    case "invoice.payment_failed":
      return ["payment_failed"];

    default:
      return [];
  }
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
