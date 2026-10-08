import { Stripe } from "stripe";

export const name = "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const createStripeClient = () => {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-09-30.endive",
  });

  return stripe;
};

const createStripeClientForKey = (apiKey: string) =>
  new Stripe(apiKey, { apiVersion: "2026-09-30.endive" });

export { createStripeClient, createStripeClientForKey, Stripe };
