import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkspaceBilling } from "@subscriber.dev/db/repository/billing.repo";
import type { BillingInterval, Plan } from "@subscriber.dev/shared";
import type { Stripe } from "@subscriber.dev/stripe";
import * as billingRepo from "@subscriber.dev/db/repository/billing.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import {
  FREE_SENDS_PER_MONTH,
  parseLookupKey,
  planByKey,
  planForSubscribers,
  PLANS,
  priceLookupKey,
} from "@subscriber.dev/shared";
import { createStripeClient } from "@subscriber.dev/stripe";

const FREE_PLAN = PLANS[0];
const CHEAPEST_PAID = PLANS[1];
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

const startOfMonthUtc = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const DAY_MS = 24 * 60 * 60 * 1000;
export const MOVE_UP_AFTER_MS = 3 * DAY_MS;

export const nextPlan = (plan: Plan): Plan | null =>
  PLANS[PLANS.indexOf(plan) + 1] ?? null;

export const ceilingFor = (plan: Plan): number =>
  plan.monthly === 0
    ? plan.subscribers
    : (nextPlan(plan)?.subscribers ?? plan.subscribers);

export function moveUpTarget(
  plan: Plan,
  billed: number,
  overLimitSince: Date | null,
  now = new Date(),
): Plan | null {
  if (plan.monthly === 0 || billed <= plan.subscribers || !overLimitSince)
    return null;
  if (now.getTime() - overLimitSince.getTime() < MOVE_UP_AFTER_MS) return null;
  return nextPlan(plan);
}

export function renewalPlan(subscribers: number): Plan | null {
  const fits = planForSubscribers(subscribers);
  if (!fits) return null;
  return fits.monthly === 0 ? CHEAPEST_PAID : fits;
}

export const billingEnabled = () =>
  process.env.BILLING_ENABLED === "true" && !!process.env.STRIPE_SECRET_KEY;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  isEnabled() {
    return billingEnabled();
  }

  requireEnabled() {
    if (!this.isEnabled())
      throw new NotFoundException(
        "Billing is only available on subscriber.dev cloud.",
      );
  }

  private stripe(): Stripe {
    this.requireEnabled();
    return createStripeClient();
  }

  private activePlan(billing: WorkspaceBilling | undefined) {
    const paid =
      billing?.stripeSubscriptionId &&
      ACTIVE_STATUSES.includes(billing.status ?? "")
        ? billing
        : null;
    return { paid, plan: (paid && planByKey(paid.plan)) || FREE_PLAN };
  }

  async billedCount(
    db: dbClient,
    environmentId: number,
    periodStart: Date | null,
  ) {
    const [optedIn, emailed] = await Promise.all([
      this.countSubscribers(db, environmentId),
      billingRepo.countDistinctEmailedSince(
        db,
        environmentId,
        periodStart ?? startOfMonthUtc(),
      ),
    ]);
    return Math.max(optedIn, emailed);
  }

  async countSubscribers(db: dbClient, environmentId: number) {
    const since = new Date();
    const [all, optedOut] = await Promise.all([
      subscriberRepo.getSubscriberCounts(db, environmentId, since),
      subscriberRepo.getOptedOutCounts(db, environmentId, since),
    ]);
    return Math.max(0, all.total - optedOut.total);
  }

  async getBilling(db: dbClient, workspaceId: number) {
    this.requireEnabled();
    const [billing, production] = await Promise.all([
      billingRepo.getBillingForWorkspace(db, workspaceId),
      billingRepo.getProductionEnvironment(db, workspaceId),
    ]);
    const { paid, plan } = this.activePlan(billing);
    const [subscribers, sendsThisMonth] = production
      ? await Promise.all([
          this.billedCount(db, production.id, paid?.currentPeriodStart ?? null),
          billingRepo.countSendsSince(db, production.id, startOfMonthUtc()),
        ])
      : [0, 0];
    const atRenewal =
      paid && !paid.cancelAtPeriodEnd ? renewalPlan(subscribers) : plan;
    const movesUpOn =
      paid?.overLimitSince && subscribers > plan.subscribers && nextPlan(plan)
        ? new Date(paid.overLimitSince.getTime() + MOVE_UP_AFTER_MS)
        : null;

    return {
      enabled: this.isEnabled(),
      plan: plan.key,
      interval: paid?.interval ?? null,
      status: paid?.status ?? null,
      currentPeriodEnd: paid?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: paid?.cancelAtPeriodEnd ?? false,
      usage: {
        subscribers,
        subscriberLimit: plan.subscribers,
        sendsThisMonth,
        sendLimit: plan.monthly === 0 ? FREE_SENDS_PER_MONTH : null,
      },
      overLimit: subscribers > plan.subscribers,
      ceiling: ceilingFor(plan),
      movesUpOn: movesUpOn?.toISOString() ?? null,
      planAtRenewal: !atRenewal
        ? "custom"
        : atRenewal.key === plan.key
          ? null
          : atRenewal.key,
    };
  }

  async createCheckoutLink(
    db: dbClient,
    workspace: { id: number; publicId: string; name: string },
    user: { email: string },
    planKey: string,
    interval: BillingInterval,
  ): Promise<{ url: string; kind: "checkout" | "changed" }> {
    const stripe = this.stripe();
    const plan = planByKey(planKey);
    if (!plan || plan.monthly === 0)
      throw new BadRequestException(`${planKey} isn't a paid plan.`);

    const existing = await billingRepo.getBillingForWorkspace(db, workspace.id);
    if (
      existing?.stripeSubscriptionId &&
      ACTIVE_STATUSES.includes(existing.status ?? "")
    ) {
      await this.changePlan(stripe, existing, plan, interval, "always_invoice");
      return {
        url: `${this.appUrl()}/billing?status=changed`,
        kind: "changed",
      };
    }

    const customerId =
      existing?.stripeCustomerId ??
      (
        await stripe.customers.create({
          email: user.email,
          name: workspace.name,
          metadata: { workspaceId: workspace.publicId },
        })
      ).id;
    if (!existing)
      await billingRepo.upsertBilling(db, workspace.id, {
        stripeCustomerId: customerId,
      });

    const lookupKey = priceLookupKey(plan.key, interval);
    const { data: prices } = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
    });
    const price = prices[0];
    if (!price)
      throw new ServiceUnavailableException(
        `No Stripe price with lookup key ${lookupKey}.`,
      );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: { workspaceId: workspace.publicId },
        billing_mode: { type: "flexible" },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      success_url: `${this.appUrl()}/billing?status=success`,
      cancel_url: `${this.appUrl()}/billing?status=cancelled`,
    });
    if (!session.url)
      throw new ServiceUnavailableException("Stripe didn't return a URL.");
    return { url: session.url, kind: "checkout" };
  }

  async createPortalLink(db: dbClient, workspaceId: number) {
    const stripe = this.stripe();
    const billing = await billingRepo.getBillingForWorkspace(db, workspaceId);
    if (!billing)
      throw new BadRequestException(
        "This workspace has no billing account yet. Start a plan first.",
      );
    return {
      url: await this.portalUrl(stripe, billing.stripeCustomerId),
      kind: "portal" as const,
    };
  }

  async handleWebhook(db: dbClient, rawBody: Buffer, signature: string) {
    const stripe = this.stripe();
    const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    if (!secret)
      throw new ServiceUnavailableException(
        "STRIPE_BILLING_WEBHOOK_SECRET isn't set.",
      );
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException("Invalid Stripe signature.");
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(db, event.data.object);
        break;
      case "invoice.upcoming":
        await this.adjustAtRenewal(db, stripe, event.data.object);
        break;
    }
    return { received: true };
  }

  private async syncSubscription(db: dbClient, sub: Stripe.Subscription) {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const billing = await billingRepo.getBillingByCustomerId(db, customerId);
    if (!billing) {
      this.logger.warn(`No workspace for Stripe customer ${customerId}`);
      return;
    }
    const item = sub.items.data[0];
    const parsed = parseLookupKey(item?.price.lookup_key);
    const ended =
      sub.status === "canceled" || sub.status === "incomplete_expired";
    await billingRepo.upsertBilling(db, billing.workspaceId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: ended ? null : sub.id,
      plan: ended ? FREE_PLAN.key : (parsed?.plan.key ?? billing.plan),
      interval: ended ? null : (parsed?.interval ?? null),
      status: sub.status,
      currentPeriodStart: item
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: sub.cancel_at
        ? new Date(sub.cancel_at * 1000)
        : item
          ? new Date(item.current_period_end * 1000)
          : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    });
  }

  private async adjustAtRenewal(
    db: dbClient,
    stripe: Stripe,
    invoice: Stripe.Invoice,
  ) {
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId) return;
    const billing = await billingRepo.getBillingByCustomerId(db, customerId);
    if (!billing?.stripeSubscriptionId) return;

    const production = await billingRepo.getProductionEnvironment(
      db,
      billing.workspaceId,
    );
    if (!production) return;
    const target = renewalPlan(await this.countSubscribers(db, production.id));
    if (!target) {
      this.logger.warn(
        `Workspace ${billing.workspaceId} is past the largest plan`,
      );
      return;
    }

    const sub = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );
    const item = sub.items.data[0];
    const current = parseLookupKey(item?.price.lookup_key);
    if (!item || !current || current.plan.key === target.key) return;

    const { data: prices } = await stripe.prices.list({
      lookup_keys: [priceLookupKey(target.key, current.interval)],
      active: true,
    });
    const price = prices[0];
    if (!price) return;
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: price.id }],
      proration_behavior: "none",
    });
    this.logger.log(
      `Workspace ${billing.workspaceId}: ${current.plan.key} → ${target.key} at renewal`,
    );
  }

  private async changePlan(
    stripe: Stripe,
    billing: WorkspaceBilling,
    plan: Plan,
    interval: BillingInterval,
    prorationBehavior: "always_invoice" | "create_prorations",
  ) {
    if (!billing.stripeSubscriptionId)
      throw new BadRequestException("No subscription to change.");
    const sub = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );
    const item = sub.items.data[0];
    const current = parseLookupKey(item?.price.lookup_key);
    if (!item) throw new BadRequestException("Subscription has no plan.");
    if (current?.plan.key === plan.key && current.interval === interval)
      throw new BadRequestException(`Already on ${plan.key} (${interval}ly).`);

    const lookupKey = priceLookupKey(plan.key, interval);
    const { data: prices } = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
    });
    const price = prices[0];
    if (!price)
      throw new ServiceUnavailableException(
        `No Stripe price with lookup key ${lookupKey}.`,
      );
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: price.id }],
      proration_behavior: prorationBehavior,
    });
  }

  async enforcePaidPlans(db: dbClient, now = new Date()) {
    if (!this.isEnabled()) return;
    const stripe = this.stripe();
    for (const billing of await billingRepo.listPaidBilling(db)) {
      const { paid, plan } = this.activePlan(billing);
      if (!paid || paid.cancelAtPeriodEnd || plan.monthly === 0) continue;
      const production = await billingRepo.getProductionEnvironment(
        db,
        paid.workspaceId,
      );
      if (!production) continue;
      const billed = await this.billedCount(
        db,
        production.id,
        paid.currentPeriodStart,
      );

      if (billed <= plan.subscribers) {
        if (paid.overLimitSince)
          await billingRepo.setOverLimitSince(db, paid.workspaceId, null);
        continue;
      }
      if (!paid.overLimitSince) {
        await billingRepo.setOverLimitSince(db, paid.workspaceId, now);
        continue;
      }
      const target = moveUpTarget(plan, billed, paid.overLimitSince, now);
      if (!target) {
        if (!nextPlan(plan))
          this.logger.warn(
            `Workspace ${paid.workspaceId} is past the largest plan`,
          );
        continue;
      }
      const interval = paid.interval ?? "month";
      await this.changePlan(
        stripe,
        paid,
        target,
        interval,
        interval === "year" ? "always_invoice" : "create_prorations",
      );
      await billingRepo.setOverLimitSince(db, paid.workspaceId, null);
      this.logger.log(
        `Workspace ${paid.workspaceId}: ${plan.key} → ${target.key} after 3 days over`,
      );
    }
  }

  async skipSendReason(
    db: dbClient,
    environmentId: number,
    subscriberId: number,
    now = new Date(),
  ): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const environment = await billingRepo.getEnvironmentById(db, environmentId);
    if (!environment || environment.slug !== "prod") return null;
    const { plan } = this.activePlan(
      await billingRepo.getBillingForWorkspace(db, environment.workspaceId),
    );
    const n = (value: number) => value.toLocaleString("en-US");
    if (plan.monthly === 0) {
      const sent = await billingRepo.countSendsSince(
        db,
        environmentId,
        startOfMonthUtc(now),
      );
      if (sent >= FREE_SENDS_PER_MONTH)
        return `Not sent: the free plan's ${n(FREE_SENDS_PER_MONTH)} sends this month are used up. Upgrade to keep sending.`;
    }
    const position = await billingRepo.subscriberPosition(
      db,
      environmentId,
      subscriberId,
    );
    if (position <= ceilingFor(plan)) return null;
    return plan.monthly === 0
      ? `Not sent: over the free plan's ${n(plan.subscribers)} subscribers. Upgrade to send to new subscribers.`
      : `Not sent: more than one plan past ${plan.key}'s ${n(plan.subscribers)} subscribers. Upgrade to send to new subscribers.`;
  }

  async checkBroadcast(
    db: dbClient,
    environmentId: number,
    audience: number,
    allowOverPlan: boolean,
  ) {
    if (!this.isEnabled()) return;
    const environment = await billingRepo.getEnvironmentById(db, environmentId);
    if (!environment || environment.slug !== "prod") return;
    const { plan } = this.activePlan(
      await billingRepo.getBillingForWorkspace(db, environment.workspaceId),
    );
    const n = (value: number) => value.toLocaleString("en-US");
    const fits = planForSubscribers(audience);
    if (audience > ceilingFor(plan))
      throw new ConflictException(
        `This broadcast reaches ${n(audience)} subscribers, past what ${plan.key} can grow to automatically (${n(ceilingFor(plan))}). Upgrade first: subscriber billing upgrade ${fits?.key ?? "business"}.`,
      );
    if (audience > plan.subscribers && !allowOverPlan) {
      const next = nextPlan(plan);
      throw new ConflictException(
        `This broadcast reaches ${n(audience)} subscribers, over ${plan.key}'s ${n(plan.subscribers)}. Sending it moves you to ${next?.key} ($${next?.monthly}/mo) after 3 days. Confirm with allowOverPlan: true.`,
      );
    }
  }

  private async portalUrl(stripe: Stripe, customerId: string) {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.appUrl()}/billing?status=portal`,
    });
    return session.url;
  }

  private appUrl() {
    return (
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://subscriber.dev"
    ).replace(/\/$/, "");
  }
}
