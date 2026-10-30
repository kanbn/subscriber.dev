import { Stripe } from "stripe";

export const name = "stripe";

export const STRIPE_API_VERSION = "2026-09-30.endive";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const createStripeClient = () => {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  });

  return stripe;
};

const createStripeClientForKey = (apiKey: string) =>
  new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION });

export { createStripeClient, createStripeClientForKey, Stripe };
