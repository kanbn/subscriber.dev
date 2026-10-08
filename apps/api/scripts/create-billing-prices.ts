
import type { BillingInterval } from "@subscriber.dev/shared";
import type { Stripe } from "@subscriber.dev/stripe";
import {
  PAID_PLANS,
  priceLookupKey,
  yearlyPrice,
} from "@subscriber.dev/shared";
import { createStripeClient } from "@subscriber.dev/stripe";

const stripe = createStripeClient();
const mode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
  ? "LIVE"
  : "test";
console.log(`Stripe ${mode} mode`);

const ours: Stripe.Product[] = [];
for await (const product of stripe.products.list({ limit: 100 }))
  if (product.metadata.app === "subscriber.dev") ours.push(product);

for (const plan of PAID_PLANS) {
  const product =
    ours.find((existing) => existing.metadata.plan === plan.key) ??
    (await stripe.products.create({
      name: `subscriber.dev ${plan.key}`,
      description: `Up to ${plan.subscribers.toLocaleString("en-US")} subscribers`,
      tax_code: "txcd_10103001",
      metadata: { app: "subscriber.dev", plan: plan.key },
    }));

  for (const interval of ["month", "year"] as BillingInterval[]) {
    const lookupKey = priceLookupKey(plan.key, interval);
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey] });
    if (existing.data.length > 0) {
      console.log(`  ${lookupKey}: exists`);
      continue;
    }
    const dollars = interval === "year" ? yearlyPrice(plan) : plan.monthly;
    await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: dollars * 100,
      recurring: { interval },
      lookup_key: lookupKey,
      metadata: { app: "subscriber.dev", plan: plan.key },
    });
    console.log(`  ${lookupKey}: created ($${dollars}/${interval})`);
  }
}
